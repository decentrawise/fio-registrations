const db = require('./models')
const {sequelize} = db

async function history(publicKey, total) {
  const sumSelect1 = total ? `select
    sum(total) as total,
    sum(confirmed_amount) as confirmed_amount,
    sum(pending_amount) as pending_amount from (` : ''

  const sumSelect2 = total ? `) balance` : ''

  const [result] = await sequelize.query(`
    ${sumSelect1}
    select
      a.created, 'purchase' as type, ap.id as source_id, ap.extern_id,
      ap.buy_price as total, ap.buy_price as confirmed_amount, 0 as pending_amount,
      null as created_by, null as notes, a.address, a.domain
      --, ape.*
    from account a
    join account_pay ap on ap.account_id = a.id
    where a.owner_key = :publicKey
    union all
    select
      created, 'adjustment' as type, adj.id as source_id, '' as extern_id,
      amount as total, amount as confirmed_amount, cast(0 as numeric) as pending_amount,
      created_by, notes, null as address, null as domain
    from account_adj adj
    where owner_key = :publicKey
    union all
    select -- credit / payment total
      coalesce(ape.extern_time, ape.created), 'payment' as type, ape.id as source_id, extern_id,
      coalesce(ape.confirmed_total * -1, 0) as total,
      coalesce(ape.confirmed_total * -1, 0) as confirmed_amount,
      coalesce(ape.pending_total * -1, 0) as pending_amount,
      ape.created_by, ape.pay_status_notes,
      a.address, a.domain
      --, ape.*
    from account a
    join account_pay ap on ap.account_id = a.id
    join account_pay_event ape on ape.id = (
      select id from account_pay_event
      where account_pay_id = ap.id
      order by id desc limit 1
    )
    where a.owner_key = :publicKey
    union all
    select -- expenses
      coalesce(t.block_time, te.created), 'transaction' as type, te.id as source_id,
      trx_id as extern_id,
      case when te.trx_status <> 'cancel' then ap.buy_price else 0 end total,
      case when te.trx_status = 'success' then ap.buy_price else 0 end confirmed_amount,
      case when te.trx_status <> 'success' and te.trx_status <> 'cancel' then ap.buy_price else 0 end pending_amount,
      te.created_by, te.trx_status_notes, a.address, a.domain
      --, te.*
    from account a
    join account_pay ap on ap.id = (
      select id from account_pay
      where account_id = a.id
      order by id limit 1
    )
    join blockchain_trx t on t.id = (
      select id from blockchain_trx
      where t.account_id = a.id and t.type = 'register'
      order by id desc limit 1
    )
    join blockchain_trx_event te on te.id = (
      select id from blockchain_trx_event
      where blockchain_trx_id = t.id
      order by id desc limit 1
    )
    where a.owner_key = :publicKey
    order by 1, 2, 3
    ${sumSelect2}`, {replacements: {publicKey}}
  )
  return result
}

module.exports = {
  history: publicKey => history(publicKey, false),
  balance: publicKey => history(publicKey, true),
}
/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('accounts', {
    id: 'id',
    address:    { type: 'string', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    latest_supply_block_crawl_at: { type: 'timestamp',  notNull: false },
    latest_supply_block_height:   { type: 'integer',    notNull: false },
    latest_checked_supply_height: { type: 'integer',    notNull: false },
    latest_checked_supply_head:   { type: 'string',     notNull: false },
  });

  pgm.createIndex('accounts', 'lower(address)', { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('accounts', 'lower(address)', { ifExists: true });
  pgm.dropTable('accounts');
};

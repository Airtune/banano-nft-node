/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('accounts', {
    id: 'id',
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },

    address:    { type: 'string', notNull: true },

    // Current head of the SupplyBlocksCrawler.
    supply_block_crawl_at:       { type: 'timestamp',  notNull: false },
    supply_block_crawl_height:   { type: 'integer',    notNull: false },
    supply_block_crawl_head:     { type: 'string',     notNull: false },
  });

  pgm.createIndex('accounts', 'lower(address)', { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('accounts', 'lower(address)', { ifExists: true });
  pgm.dropTable('accounts');
};

/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('accounts', {
    id: 'id',
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },

    address:    { type: 'varchar(65)', notNull: true },
    is_nft_issuer: { type: 'boolean', notNull: true, default: false },

    // Current head of the SupplyBlocksCrawler.
    supply_block_crawl_at:     { type: 'timestamp', notNull: false },
    supply_block_crawl_height: { type: 'integer',   notNull: false },
    supply_block_crawl_head:   { type: 'varchar(65)',    notNull: false },
  });

  // Create index on the lower-case of address.
  pgm.createIndex('accounts', 'lower(address)', { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('accounts', 'lower(address)', { ifExists: true });
  pgm.dropTable('accounts');
};

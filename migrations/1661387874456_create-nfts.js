/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('nfts', {
    id: 'id',
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },

    // Representative used in send blocks to send the NFT.
    asset_representative:     { type: 'varchar(64)', notNull: true },

    supply_block_id:          { type: 'integer', references: 'supply_blocks' },
    supply_block_hash:        { type: 'varchar(64)',  notNull: true },
  
    mint_number:              { type: 'integer', notNull: true, default: 0 },

    // Current head of the crawler
    crawl_at:                 { type: 'timestamp', notNull: true },
    crawl_block_height:       { type: 'integer', notNull: true },
    crawl_block_head:         { type: 'varchar(64)', notNull: true }
  });

  pgm.createIndex('nfts', 'owner_id');
  pgm.createIndex('nfts', 'account_id');
  pgm.createIndex('nfts', 'supply_block_id');
  pgm.createIndex('nfts', ['supply_block_id', 'mint_number'], { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('nfts', ['supply_block_id', 'mint_number'], { ifExists: true });
  pgm.dropIndex('nfts', 'account_id', { ifExists: true });
  pgm.dropIndex('nfts', 'owner_id', { ifExists: true });
  pgm.dropTable('nfts', { ifExists: true });
};

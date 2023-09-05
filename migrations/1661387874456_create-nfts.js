/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('nfts', {
    id: 'id',
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },

    // Representative used in send blocks to send the NFT.
    asset_representative:     { type: 'varchar(65)', notNull: true },

    supply_block_id:          { type: 'integer', references: 'supply_blocks' },
    supply_block_hash:        { type: 'varchar(65)',  notNull: true },
    // TODO: Create migration that caches frontier nft blocks so the database doesn't have to find the frontier block on non-history queries
    // frontier_nft_block_id:    { type: 'integer', references: 'nft_blocks' },
  
    mint_number:              { type: 'integer', notNull: true, default: 0 },

    // Current head of the crawler
    crawl_at:                 { type: 'timestamp', notNull: true },
    crawl_block_height:       { type: 'integer', notNull: true },
    crawl_block_head:         { type: 'varchar(65)', notNull: true }
  });

  pgm.createIndex('nfts', 'supply_block_id');
  pgm.createIndex('nfts', ['supply_block_id', 'mint_number'], { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('nfts', ['supply_block_id', 'mint_number'], { ifExists: true });
  pgm.dropTable('nfts', { ifExists: true });
};

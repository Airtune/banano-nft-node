/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('nfts', {
    id: 'id',
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },

    // Representative used in send blocks to send the NFT.
    asset_representative:     { type: 'string', notNull: true },

    // Current owner of the NFT.
    owner_id:   { type: 'integer', references: 'accounts' },
    // Current account to crawl for the asset chain. May differ from owner during swaps.
    account_id: { type: 'integer', references: 'accounts' },
    supply_block_id:          { type: 'integer', references: 'supply_blocks' },
  
    mint_number:              { type: 'integer', notNull: true, default: 0 },
    mint_block_hash:          { type: 'string', notNull: true },
    mint_block_height:        { type: 'integer', notNull: true },

    // Current head of the crawler
    crawl_at:                 { type: 'datetime', notNull: true },
    crawl_block_height:       { type: 'integer', notNull: true },
    crawl_block_head:         { type: 'string', notNull: true },
    
    // Current state of the NFT.
    locked:     { type: 'boolean', notNull: true },
    state:      { type: 'string', notNull: true },

    // NFT history. The asset_chain_frontiers may be needed to continue the crawler.
    asset_chain_frontiers:    { type: 'jsonb', notNull: true },
    asset_chain_height:       { type: 'integer', notNull: true },

    // Current frontier of the asset chain. May be behind the crawler head.
    frontier_hash:            { type: 'string', notNull: true },
    frontier_height:          { type: 'integer', notNull: true },
  });

  pgm.createIndex('nfts', 'owner_id');
  pgm.createIndex('nfts', 'account_id');
  pgm.createIndex('nfts', 'supply_block_id');
  pgm.createIndex('nfts', 'upper(mint_block_hash)', { unique: true });
  pgm.createIndex('nfts', ['supply_block_id', 'mint_block_height'], { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('nfts', ['supply_block_id', 'mint_block_height'], { ifExists: true });
  pgm.dropIndex('nfts', 'upper(mint_block_hash)', { ifExists: true });
  pgm.dropIndex('nfts', 'supply_block_id');
  pgm.dropIndex('nfts', 'account_id');
  pgm.dropIndex('nfts', 'owner_id');
  pgm.dropTable('nfts');
};

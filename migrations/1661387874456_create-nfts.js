/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('nfts', {
    id: 'id',
    supply_block_id:          { type: 'integer', references: 'supply_blocks' },    
    mint_number:              { type: 'integer', notNull: true, default: 0 },
    mint_block_hash:          { type: 'string', notNull: true },
    mint_block_height:        { type: 'integer', notNull: true },
    asset_representative:     { type: 'string', notNull: true },
    asset_chain_height:       { type: 'integer', notNull: true },
    frontier_block_hash:      { type: 'string', notNull: true },
    frontier_block_height:    { type: 'integer', notNull: true },
    latest_asset_crawl_at:    { type: 'datetime', notNull: false },
    latest_checked_account_height: { type: 'integer', notNull: true },
    account_id: { type: 'integer', references: 'accounts' },
    owner_id:   { type: 'integer', references: 'accounts' },
    locked:     { type: 'boolean', notNull: true },
    state:      { type: 'string', notNull: true },
    asset_chain_frontiers: { type: 'json', notNull: true },
  });

  pgm.createIndex('nfts', 'account_id');
  pgm.createIndex('nfts', 'owner_id');
  pgm.createIndex('nfts', 'supply_block_id');
  pgm.createIndex('nfts', 'upper(mint_block_hash)', { unique: true });
  pgm.createIndex('nfts', ['supply_block_id', 'mint_block_height'], { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('nfts', ['supply_block_id', 'mint_block_height'], { ifExists: true });
  pgm.dropIndex('nfts', 'upper(mint_block_hash)', { ifExists: true });
  pgm.dropIndex('nfts', 'supply_block_id');
  pgm.dropIndex('nfts', 'owner_id');
  pgm.dropIndex('nfts', 'account_id');
  pgm.dropTable('nfts');
};

/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('supply_blocks', {
    id: 'id',
    issuer_id: { type: 'integer', references: 'accounts' },
    max_supply:   { type: 'integer', notNull: false },
    mint_count:   { type: 'integer', notNull: true, default: 0 },
    burn_count:   { type: 'integer', notNull: true, default: 0 },
    supply_block_hash:          { type: 'string', notNull: true },
    supply_block_height:        { type: 'integer', notNull: true },
    metadata_representative:    { type: 'string', notNull: false },
    latest_mint_block_height:   { type: 'integer', notNull: false },
    latest_mint_block_crawl_at: { type: 'datetime', notNull: false },
    latest_checked_mint_height: { type: 'integer', notNull: true },
  });

  pgm.createIndex('supply_blocks', 'issuer_id');
  pgm.createIndex('supply_blocks', 'upper(supply_block_hash)', { unique: true });
  pgm.createIndex('supply_blocks', ['issuer_id', 'supply_block_height'], { unique: true });
  pgm.createIndex('supply_blocks', ['issuer_id', 'lower(metadata_representative)'], { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('supply_blocks', ['issuer_id', 'lower(metadata_representative)'], { ifExists: true });
  pgm.dropIndex('supply_blocks', ['issuer_id', 'supply_block_height'], { ifExists: true });
  pgm.dropIndex('supply_blocks', 'upper(supply_block_hash)', { ifExists: true });
  pgm.dropIndex('supply_blocks', 'issuer_id');
  pgm.dropTable('supply_blocks');
};

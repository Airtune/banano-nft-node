/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('supply_blocks', {
    id: 'id',
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },

    // Representative used in blocks by the issuer to mint NFTs.
    metadata_representative: { type: 'string', notNull: false },

    issuer_id:    { type: 'integer', references: 'accounts' },

    // To keep track of the supply.
    max_supply:   { type: 'integer', notNull: false },
    mint_count:   { type: 'integer', notNull: true, default: 0 },
    burn_count:   { type: 'integer', notNull: true, default: 0 },

    // Supply block in the Banano ledger. Block at block_height + 1 is the first mint block in most cases.
    // https://github.com/Airtune/banano-nft-meta-protocol/blob/main/ledger_protocol/supply_block.md#validation
    block_hash:          { type: 'string', notNull: true },
    block_height:        { type: 'integer', notNull: true },

    // Current head for the MintBlocksCrawler. May be ahead of the latest mint block.
    mint_crawl_at:       { type: 'datetime', notNull: false },
    mint_crawl_height:   { type: 'integer', notNull: true },
    mint_crawl_head:     { type: 'string', notNull: true },
  });

  pgm.createIndex('supply_blocks', 'issuer_id');
  pgm.createIndex('supply_blocks', 'upper(block_hash)', { unique: true });
  pgm.createIndex('supply_blocks', ['issuer_id', 'block_height'], { unique: true });
  pgm.createIndex('supply_blocks', ['issuer_id', 'lower(metadata_representative)'], { unique: true });
};

exports.down = pgm => {
  pgm.dropIndex('supply_blocks', ['issuer_id', 'lower(metadata_representative)'], { ifExists: true });
  pgm.dropIndex('supply_blocks', ['issuer_id', 'block_height'], { ifExists: true });
  pgm.dropIndex('supply_blocks', 'upper(block_hash)', { ifExists: true });
  pgm.dropIndex('supply_blocks', 'issuer_id');
  pgm.dropTable('supply_blocks');
};

/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('supply_blocks', {
    id: 'id',
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },

    // Representative used in blocks by the issuer to mint NFTs.
    // First mint block following the supply block has the metadata_representative.
    metadata_representative: { type: 'varchar(65)', notNull: true },
    ipfs_cid: { type: 'string', notNull: true }, // encoded in the metadata_representative

    issuer_id:      { type: 'integer', notNull: true, references: 'accounts' },
    issuer_address: { type: 'varchar(65)',  notNull: true },

    // To keep track of the supply.
    max_supply:   { type: 'string', notNull: true }, // bigint stored as string
    mint_count:   { type: 'integer', notNull: true, default: 0 },
    burn_count:   { type: 'integer', notNull: true, default: 0 },

    // Supply block in the Banano ledger. Block at block_height + 1 is the first mint block in most cases.
    // https://github.com/Airtune/banano-nft-meta-protocol/blob/main/ledger_protocol/supply_block.md#validation
    block_hash:          { type: 'varchar(65)', notNull: true },
    block_height:        { type: 'integer', notNull: true },
    // Present if there's a block that finishes the supply so no more NFTs can be minted
    finished_supply_block_hash: { type: 'varchar(65)', notNull: false }, // TODO: Actually set this or remove it entirely to avoid confusion

    // Current head for the MintBlocksCrawler. May be ahead of the latest mint block.
    mint_crawl_at:       { type: 'timestamp', notNull: true },
    mint_crawl_height:   { type: 'integer', notNull: true },
    mint_crawl_head:     { type: 'varchar(65)', notNull: true },
  });
  
  // Create the indexes.
  pgm.createIndex('supply_blocks', 'issuer_id');
  pgm.createIndex('supply_blocks', 'upper(block_hash)', { unique: true });
  pgm.createIndex('supply_blocks', ['issuer_id', 'block_height'], { unique: true });
  pgm.createIndex('supply_blocks', ['issuer_id', 'lower(metadata_representative)'], { unique: true });
};

exports.down = pgm => {
  // Drop the indexes.
  pgm.dropIndex('supply_blocks', ['issuer_id', 'lower(metadata_representative)'], { ifExists: true });
  pgm.dropIndex('supply_blocks', ['issuer_id', 'block_height'], { ifExists: true });
  pgm.dropIndex('supply_blocks', 'upper(block_hash)', { ifExists: true });
  pgm.dropIndex('supply_blocks', 'issuer_id', { ifExists: true });

  // Drop the table.
  pgm.dropTable('supply_blocks');
};

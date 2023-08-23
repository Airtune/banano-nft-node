/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('nft_blocks', {
    id: 'id',
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    nft_id: { type: 'integer', references: 'nfts', notNull: true },
    nft_block_height: { type: 'integer', notNull: true },
    nft_block_parent_id: { type: 'integer', notNull: false },
    state: { type: 'string', notNull: true }, // TAssetState
    type: { type: 'string', notNull: true }, // TAssetBlockType: `${block_subtype}#${metaprotocol_type}` e.g. 'send#asset'
    account_id: { type: 'integer', notNull: true, references: 'accounts' },
    account_address: { type: 'varchar(64)', notNull: true },
    owner_id: { type: 'integer', notNull: true, references: 'accounts' },
    owner_address: { type: 'varchar(64)', notNull: true },
    block_account: { type: 'varchar(64)', notNull: true },
    block_hash: { type: 'varchar(64)', notNull: true }, // TBlockHash
    block_link: { type: 'varchar(64)', notNull: true }, // TBlockHash
    block_height: { type: 'integer', notNull: true },
    block_representative: { type: 'varchar(64)', notNull: true }, // TAccount
    block_amount: { type: 'string', notNull: true }, // raw amount
  });

  pgm.createIndex('nft_blocks', 'owner_id');
  pgm.createIndex('nft_blocks', 'account_id');
  pgm.createIndex('nft_blocks', 'nft_block_parent_id');
  pgm.addConstraint('nft_blocks', 'unique_nft_id_nft_block_height', {
    unique: ['nft_id', 'nft_block_height'],
  });
};

exports.down = (pgm) => {
  // Drop the constraint and indices.
  pgm.dropConstraint('nft_blocks', 'unique_nft_id_nft_block_height', { ifExists: true });
  pgm.dropIndex('nft_blocks', 'nft_block_parent_id', { ifExists: true });
  pgm.dropIndex('nft_blocks', 'account_id', { ifExists: true });
  pgm.dropIndex('nft_blocks', 'owner_id', { ifExists: true });
  
  // Drop the table.
  pgm.dropTable('nft_blocks');
};

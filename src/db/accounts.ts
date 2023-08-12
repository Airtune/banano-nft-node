import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { get_issuers } from "../get-issuers";

export const findAccountIdByAddress = async (pgClient: any, address: TAccount): Promise<number|undefined> => {
  const pgRes = await pgClient.query(`SELECT id FROM accounts WHERE accounts.address = $1`, [address]);

  if (pgRes.rows[0]) {
    return pgRes.rows[0]["id"];
  } else {
    return undefined;
  }
}

export const createAccount = async (pgClient: any, address: TAccount, supply_block_crawl_at: Date, supply_block_crawl_height: number, supply_block_crawl_head: TBlockHash, create_as_nft_issuer: boolean) => {
  const issuers = await get_issuers();
  let is_nft_issuer = create_as_nft_issuer || issuers.includes(address);

  const pgRes = await pgClient.query(
    `INSERT INTO accounts(address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head, is_nft_issuer) VALUES ($1, $2, $3, $4, $5) RETURNING id;`,
    [address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head, is_nft_issuer]
  ).catch((error) => {
    throw(error);
  });

  if (pgRes.rows[0]) {
    return pgRes.rows[0]["id"];
  } else {
    return undefined;
  }
};

export const createOrUpdateAccount = async (pgClient: any, address: TAccount, supply_block_crawl_at: (Date | null), supply_block_crawl_head: (TBlockHash | null), supply_block_crawl_height: (number | null), create_as_nft_issuer: boolean): Promise<number | undefined> => {
  const issuers = await get_issuers();
  let is_nft_issuer = create_as_nft_issuer || issuers.includes(address);

  const pgRes = await pgClient.query(
    `
    INSERT INTO accounts(address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head, is_nft_issuer) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (lower(address))
    DO
    UPDATE
      SET supply_block_crawl_at = $2,
          supply_block_crawl_height = $3,
          supply_block_crawl_head = $4,
          is_nft_issuer = (is_nft_issuer OR $5)
    RETURNING id;`,
    [address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head, is_nft_issuer]
  ).catch((error) => {
    throw(error);
  });

  if (typeof(pgRes) !== 'undefined' && pgRes.rows[0]) {
    return pgRes.rows[0]["id"];
  } else {
    return undefined;
  }
};

export const findOrCreateAccount = async (
  pgClient: any, 
  address: TAccount, 
  supply_block_crawl_at: (Date | null), 
  supply_block_crawl_head: (TBlockHash | null), 
  supply_block_crawl_height: (number | null), 
  create_as_nft_issuer: boolean
): Promise<number | undefined> => {
  const issuers = await get_issuers();
  let is_nft_issuer = create_as_nft_issuer || issuers.includes(address);

  // Try to create a new account with the provided details.
  // If an account with the same address already exists (ignoring case), 
  // do nothing instead of creating a new account.
  const pgRes = await pgClient.query(
    `
    INSERT INTO accounts(address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head, is_nft_issuer) 
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (lower(address))
    DO NOTHING
    RETURNING id;`,
    [address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head, is_nft_issuer]
  ).catch((error) => {
    throw(error);
  });

  // If the operation was successful, return the id of the created or found account.
  // If it wasn't, return undefined.
  if (typeof(pgRes) !== 'undefined' && pgRes.rows[0]) {
    return pgRes.rows[0]["id"];
  } else {
    // If an account with the given address already existed, fetch its id.
    const existingAccount = await pgClient.query(
      `SELECT id FROM accounts WHERE lower(address) = lower($1);`,
      [address]
    ).catch((error) => {
      throw(error);
    });

    if (typeof(existingAccount) !== 'undefined' && existingAccount.rows[0]) {
      return existingAccount.rows[0]["id"];
    } else {
      return undefined;
    }
  }
};

// TODO: remove, unused?
/*
const getSupplyBlockHead = async (pgClient: any, issuer: TAccount): Promise<{supply_block_crawl_at: any, supply_block_crawl_height: number, supply_block_crawl_head: TBlockHash}> => {
  const pgRes = await pgClient.query(`
    SELECT
      supply_block_crawl_at,
      supply_block_crawl_height,
      supply_block_crawl_head
    FROM accounts
    WHERE accounts.address = LOWER($1)
    LIMIT 1;
  `, [issuer]).catch((error) => { throw(error) });

  const row = pgRes.rows[0];
  let supplyBlockCrawlAt     = undefined;
  let supplyBlockCrawlHeight = undefined;
  let supplyBlockCrawlHead   = undefined;

  if (pgRes.rows.length == 1) {
    supplyBlockCrawlAt     = row.supply_block_crawl_at;
    supplyBlockCrawlHeight = parseInt(row.supply_block_crawl_height || 0);
    supplyBlockCrawlHead   = row.supply_block_crawl_head;
  } else if (pgRes.rows.length > 1) {
    throw Error("Unexpected multiple rows for accounts in fetchSupplyBlockHeadFromCache. Is accounts missing a unique constraint on address?");
  }
  
  return {
    supply_block_crawl_at: supplyBlockCrawlAt,
    supply_block_crawl_height: supplyBlockCrawlHeight,
    supply_block_crawl_head: supplyBlockCrawlHead as TBlockHash
  };
};
*/
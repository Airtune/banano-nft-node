import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";

export const findAccountIdByAddress = async (pgClient: any, address: TAccount): Promise<number|undefined> => {
  const pgRes = await pgClient.query(`SELECT id FROM accounts WHERE accounts.address = $1`, [address]);

  if (pgRes.rows[0]) {
    return pgRes.rows[0]["id"];
  } else {
    return undefined;
  }
}

export const createAccount = async (pgClient: any, address: TAccount, supply_block_crawl_at: Date, supply_block_crawl_height: number, supply_block_crawl_head: TBlockHash) => {
  const pgRes = await pgClient.query(
    `INSERT INTO accounts(address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head) VALUES ($1, $2, $3, $4) RETURNING id;`,
    [address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head]
  ).catch((error) => {
    throw(error);
  });

  if (pgRes.rows[0]) {
    return pgRes.rows[0]["id"];
  } else {
    return undefined;
  }
};

export const createOrUpdateAccount = async (pgClient: any, address: TAccount, supply_block_crawl_at: (Date | null), supply_block_crawl_head: (TBlockHash | null), supply_block_crawl_height: (number | null)) => {
  const pgRes = await pgClient.query(
    `
    INSERT INTO accounts(address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head) VALUES ($1, $2, $3, $4)
    ON CONFLICT (lower(address))
    DO
    UPDATE
      SET supply_block_crawl_at = $2,
          supply_block_crawl_height = $3,
          supply_block_crawl_head = $4
    RETURNING id;`,
    [address, supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head]
  ).catch((error) => {
    throw(error);
  });

  if (typeof(pgRes) !== 'undefined' && pgRes.rows[0]) {
    return pgRes.rows[0]["id"];
  } else {
    return undefined;
  }
};

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
    supplyBlockCrawlHeight = BigInt(row.latest_checked_supply_height || 0);
    supplyBlockCrawlHead   = row.latest_checked_supply_head;
  } else if (pgRes.rows.length > 1) {
    throw Error("Unexpected multiple rows for accounts in fetchSupplyBlockHeadFromCache. Is accounts missing a unique constraint on address?");
  }
  
  return {
    supply_block_crawl_at: supplyBlockCrawlAt,
    supply_block_crawl_height: supplyBlockCrawlHeight,
    supply_block_crawl_head: supplyBlockCrawlHead as TBlockHash
  };
};
import { mainMutexManager } from "./lib/mutex-manager";

const ms_between_supply_blocks = 50;
const ms_between_issuers       = 250;
const ms_between_mint_blocks   = 19;
const ms_retry                 = 350;
const ms_between_passive_asset_checks = 250;
export const ms_undiscovered_crawls = 5000;
let bananodeLastRequestAt: any = null;
const BANANODE_DELAY_MULTIPLIER = parseFloat(process.env.DELAY_MULTIPLIER) || 1.0;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(() => { resolve('') }, ms);
  });
}

const bananode_cooldown_ms = async (cooldown_ms: number) => {
  let timeSinceLastCallMs = null;

  await mainMutexManager.runExclusive('bananodeLastRequestAt', () => {
    const currentTime: any = new Date();
    if (bananodeLastRequestAt === null) {
      timeSinceLastCallMs = currentTime - bananodeLastRequestAt;
    }
    bananodeLastRequestAt = currentTime;
  });

  if (timeSinceLastCallMs === null) {
    return 0;
  } else if (timeSinceLastCallMs > cooldown_ms) {
    return 0;
  }

  return cooldown_ms;
}

export const delay_between_supply_blocks = async (delay_multiplier: number = BANANODE_DELAY_MULTIPLIER) => {
  const cooldown_ms = await bananode_cooldown_ms(ms_between_supply_blocks * delay_multiplier);
  delay(cooldown_ms);
}

export const delay_between_issuers = async (delay_multiplier: number = BANANODE_DELAY_MULTIPLIER) => {
  const cooldown_ms = await bananode_cooldown_ms(ms_between_issuers * delay_multiplier);
  delay(cooldown_ms);
}

export const delay_between_mint_blocks = async (delay_multiplier: number = BANANODE_DELAY_MULTIPLIER) => {
  const cooldown_ms = await bananode_cooldown_ms(ms_between_mint_blocks * delay_multiplier);
  delay(cooldown_ms);
}

export const delay_between_retries = async (delay_multiplier: number = BANANODE_DELAY_MULTIPLIER) => {
  const cooldown_ms = await bananode_cooldown_ms(ms_retry * delay_multiplier);
  delay(cooldown_ms);
}

export const delay_between_undiscovered_crawls = async (delay_multiplier: number = BANANODE_DELAY_MULTIPLIER) => {
  const cooldown_ms = await bananode_cooldown_ms(ms_undiscovered_crawls * delay_multiplier);
  delay(cooldown_ms);
}

export const delay_between_passive_asset_checks = async (delay_multiplier: number = BANANODE_DELAY_MULTIPLIER) => {
  const cooldown_ms = await bananode_cooldown_ms(ms_between_passive_asset_checks * delay_multiplier);
  delay(cooldown_ms);
}

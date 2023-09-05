import { delay_between_retries } from "../bananode-cooldown";

// delays to avoid running out of memory on low spec banano nodes
const DEFAULT_MAX_RETRIES = 5;

// retry function if an error is throw with a delay in between retries
export async function retry_on_error(fn, max_retries: number = DEFAULT_MAX_RETRIES) {
  let retries: number = 0;

  while (true) {
    retries += 1;

    try {
      return await fn();
    } catch (error) {
      if (retries >= max_retries) {
        throw error;
      }
      console.log(`retrying after getting error: ${error.toString()}`);
      await delay_between_retries();
    }
  }
}

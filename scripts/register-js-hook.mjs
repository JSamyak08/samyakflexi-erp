import { register } from 'node:module';

await register(new URL('./resolve-js-hook.mjs', import.meta.url));

import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Todas as rotas do NFCFLOW são dinâmicas (sem ISR), então não é preciso cache incremental (R2/KV).
export default defineCloudflareConfig({});

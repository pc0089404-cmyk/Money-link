import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

/**
 * Official CBN Revised NUBAN 10-digit Check-Digit Validator.
 * Supports 3-digit DMB codes (padded to 9 digits with 000000) and 5/6-digit OFI codes (padded to 9 digits with prefix 9).
 */
function verifyCbnNubanCheckDigit(bankCode: string, accountNumber: string): boolean {
  if (!/^\d{10}$/.test(accountNumber)) return false;
  const cleanCode = bankCode.replace(/\D/g, '');
  if (!cleanCode) return false;

  let bank9 = '';
  if (cleanCode.length === 3) {
    bank9 = `000000${cleanCode}`;
  } else if (cleanCode.length === 5) {
    bank9 = `9000${cleanCode}`;
  } else if (cleanCode.length === 6) {
    bank9 = `900${cleanCode}`;
  } else {
    return true;
  }

  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];
  const combined = `${bank9}${accountNumber.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 18; i += 1) {
    sum += Number(combined[i]) * weights[i];
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(accountNumber[9]);
}

function getValidPaystackKey(): string | null {
  const raw = (process.env.PAYSTACK_SECRET_KEY || '').trim();
  if (!raw || raw === 'MY_PAYSTACK_SECRET_KEY' || raw.length < 12) {
    return null;
  }
  return raw;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Check whether Paystack live secret key is configured in server environment
  app.get('/api/paystack/status', (_req, res) => {
    const key = getValidPaystackKey();
    res.json({
      configured: Boolean(key),
    });
  });

  // Resolve Nigerian 10-digit NUBAN Bank Account via Paystack NIBSS (or CBN NUBAN verification fallback)
  app.get('/api/banks/resolve', async (req, res) => {
    const accountNumber = String(req.query.account_number || '').replace(/\D/g, '');
    const bankCode = String(req.query.bank_code || '').trim();

    if (accountNumber.length !== 10) {
      res.status(400).json({
        status: false,
        error: 'Enter a valid 10-digit Nigerian account number.',
      });
      return;
    }

    if (!bankCode || !/^[a-zA-Z0-9]{2,10}$/.test(bankCode)) {
      res.status(400).json({
        status: false,
        error: 'Select a valid Nigerian bank.',
      });
      return;
    }

    const paystackKey = getValidPaystackKey();

    // 1. Live Paystack NIBSS Account Resolution when PAYSTACK_SECRET_KEY is configured
    if (paystackKey) {
      try {
        const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(
          accountNumber
        )}&bank_code=${encodeURIComponent(bankCode)}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${paystackKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(7000),
        });

        const payload = (await response.json()) as {
          status?: boolean;
          message?: string;
          data?: { account_name?: string; account_number?: string; bank_id?: number };
        };

        if (response.ok && payload.status && payload.data?.account_name) {
          res.json({
            status: true,
            source: 'paystack_live',
            paystackConfigured: true,
            accountNumber: payload.data.account_number || accountNumber,
            accountName: payload.data.account_name,
            bankCode,
          });
          return;
        }

        res.status(422).json({
          status: false,
          paystackConfigured: true,
          error:
            payload.message ||
            'Could not verify this account number with the selected Nigerian bank.',
        });
        return;
      } catch (err) {
        res.status(502).json({
          status: false,
          paystackConfigured: true,
          error:
            err instanceof Error
              ? `Bank verification network error: ${err.message}`
              : 'Unable to reach Paystack verification service.',
        });
        return;
      }
    }

    // 2. When PAYSTACK_SECRET_KEY is not yet added, validate NUBAN structure via CBN algorithm
    const isPhoneWalletBank = ['999992', '999991', '50515', '50211', '100002', '120003', '120004'].includes(
      bankCode
    );
    const nubanValid = isPhoneWalletBank || verifyCbnNubanCheckDigit(bankCode, accountNumber);

    res.json({
      status: true,
      source: 'cbn_nuban_check',
      paystackConfigured: false,
      nubanChecksumValid: nubanValid,
      accountNumber,
      bankCode,
    });
  });

  const distPath = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV !== 'development' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Money Link server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

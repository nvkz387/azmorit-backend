const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Регистрация реферала
app.post('/api/register', async (req, res) => {
  const { wallet, refCode } = req.body;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });

  const normalized = wallet.toLowerCase().trim();
  const genRefCode = normalized.slice(0, 8).toUpperCase();

  try {
    await supabase.from('referrals').upsert({ 
      wallet: normalized, 
      ref_code: genRefCode 
    }, { onConflict: 'wallet' });

    if (refCode && refCode.length === 8) {
      const { data: referrer } = await supabase
        .from('referrals')
        .select('wallet')
        .eq('ref_code', refCode.toUpperCase())
        .single();

      if (referrer && referrer.wallet !== normalized) {
        await supabase
          .from('referrals')
          .update({ referrer_wallet: referrer.wallet })
          .eq('wallet', normalized);

        await supabase
          .from('referrals')
          .update({ 
            direct_referrals: supabase.rpc('array_append', { arr: 'direct_referrals', elem: normalized }) 
          })
          .eq('wallet', referrer.wallet);
      }
    }

    res.json({ success: true, refCode: genRefCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Получение статистики рефералов
app.get('/api/stats/:wallet', async (req, res) => {
  const wallet = req.params.wallet.toLowerCase().trim();

  const { data: user } = await supabase
    .from('referrals')
    .select('*')
    .eq('wallet', wallet)
    .single();

  if (!user) return res.status(404).json({ error: 'Not found' });

  const { data: level2 } = await supabase
    .from('referrals')
    .select('wallet')
    .in('referrer_wallet', user.direct_referrals || []);

  res.json({
    refCode: user.ref_code,
    directCount: (user.direct_referrals || []).length,
    level2Count: (level2 || []).length,
    purchasedSOL: parseFloat(user.purchased_sol || 0),
    bonusEarned: parseFloat(user.bonus_earned || 0)
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AZMORIT Backend запущен на порту ${PORT}`);
});

// Тестовый маршрут для проверки
app.get('/', (req, res) => {
  res.json({ 
    status: "OK", 
    message: "AZMORIT Backend работает успешно!",
    version: "1.0"
  });
});
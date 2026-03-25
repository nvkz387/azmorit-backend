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

// ====================== РЕГИСТРАЦИЯ РЕФЕРАЛА ======================
app.post('/api/register', async (req, res) => {
  const { wallet, refCode } = req.body;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });

  const normalized = wallet.toLowerCase().trim();
  const myRefCode = normalized.slice(0, 8).toUpperCase();

  try {
    // Создаём/обновляем пользователя
    await supabase.from('referrals').upsert({
      wallet: normalized,
      ref_code: myRefCode
    }, { onConflict: 'wallet' });

    // Если есть реферальный код
    if (refCode && refCode.length === 8) {
      const upperRef = refCode.toUpperCase();

      const { data: referrer } = await supabase
        .from('referrals')
        .select('wallet')
        .eq('ref_code', upperRef)
        .single();

      if (referrer && referrer.wallet !== normalized) {
        // Привязываем реферера
        await supabase
          .from('referrals')
          .update({ referrer_wallet: referrer.wallet })
          .eq('wallet', normalized);

        console.log(`✅ Привязан реферал ${normalized} к ${referrer.wallet}`);
      }
    }

    res.json({ success: true, refCode: myRefCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ====================== СТАТИСТИКА (упрощённая и надёжная) ======================
app.get('/api/stats/:wallet', async (req, res) => {
  const wallet = req.params.wallet.toLowerCase().trim();

  // Получаем пользователя
  const { data: user } = await supabase
    .from('referrals')
    .select('ref_code')
    .eq('wallet', wallet)
    .single();

  if (!user) return res.status(404).json({ error: 'Not found' });

  // Считаем прямых рефералов (сколько людей имеют referrer_wallet = этот кошелёк)
  const { count: directCount } = await supabase
    .from('referrals')
    .select('*', { count: 'exact', head: true })
    .eq('referrer_wallet', wallet);

  // Считаем рефералов 2 уровня (рефералы рефералов)
  const { data: directReferrals } = await supabase
    .from('referrals')
    .select('wallet')
    .eq('referrer_wallet', wallet);

  let level2Count = 0;
  if (directReferrals && directReferrals.length > 0) {
    const directWallets = directReferrals.map(r => r.wallet);
    const { count } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .in('referrer_wallet', directWallets);
    level2Count = count || 0;
  }

  res.json({
    refCode: user.ref_code,
    directCount: directCount || 0,
    level2Count: level2Count,
    purchasedSOL: 0,
    bonusEarned: 0
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AZMORIT Backend запущен на порту ${PORT}`);
});

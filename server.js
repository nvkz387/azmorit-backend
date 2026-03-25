// server.js — AZMORIT Backend (финальная исправленная версия)
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
  const genRefCode = normalized.slice(0, 8).toUpperCase();

  try {
    // Создаём или обновляем пользователя
    let { data: user, error } = await supabase
      .from('referrals')
      .upsert({ 
        wallet: normalized, 
        ref_code: genRefCode 
      }, { onConflict: 'wallet' })
      .select()
      .single();

    if (error) throw error;

    // Если пришёл реферальный код
    if (refCode && refCode.length === 8 && refCode.toUpperCase() !== genRefCode) {
      const upperRef = refCode.toUpperCase();

      const { data: referrer } = await supabase
        .from('referrals')
        .select('wallet')
        .eq('ref_code', upperRef)
        .single();

      if (referrer && referrer.wallet !== normalized) {
        console.log(`✅ Привязываем реферера: ${referrer.wallet} → ${normalized}`);

        // Привязываем реферера к новому пользователю
        await supabase
          .from('referrals')
          .update({ referrer_wallet: referrer.wallet })
          .eq('wallet', normalized);

        // Добавляем нового пользователя в список direct_referrals реферера
        await supabase
          .from('referrals')
          .update({
            direct_referrals: supabase.rpc('array_append', {
              arr: 'direct_referrals',
              elem: normalized
            })
          })
          .eq('wallet', referrer.wallet);
      }
    }

    res.json({ success: true, refCode: genRefCode });
  } catch (err) {
    console.error('Ошибка в /api/register:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ====================== ПОЛУЧЕНИЕ СТАТИСТИКИ ======================
app.get('/api/stats/:wallet', async (req, res) => {
  const wallet = req.params.wallet.toLowerCase().trim();

  const { data: user, error } = await supabase
    .from('referrals')
    .select('*')
    .eq('wallet', wallet)
    .single();

  if (error || !user) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Подсчёт рефералов 2 уровня
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
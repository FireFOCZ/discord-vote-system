import { pool } from './db.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function createPollDB({ guild_id, channel_id, question, options, allow_everyone, created_by, end_at }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.execute(
      `INSERT INTO polls (guild_id, channel_id, question, allow_everyone, created_by, end_at)
       VALUES (?,?,?,?,?,?)`,
      [guild_id, channel_id, question, allow_everyone ? 1 : 0, created_by ?? null, end_at ?? null]
    );
    const pollId = res.insertId;

    for (const opt of options) {
      await conn.execute(
        `INSERT INTO poll_options (poll_id, label, emoji) VALUES (?,?,?)`,
        [pollId, opt.label, opt.emoji ?? null]
      );
    }

    await conn.commit();
    return pollId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getPoll(id) {
  try {
    const [[poll]] = await pool.execute('SELECT * FROM polls WHERE id=?', [id]);
    if (!poll) return null;
    const [options] = await pool.execute('SELECT * FROM poll_options WHERE poll_id=? ORDER BY id', [id]);
    return { poll, options };
  } catch (err) {
    console.error('❌ Chyba v getPoll:', err);
    return null;
  }
}

export async function setMessageId(id, msg) {
  await pool.execute('UPDATE polls SET message_id=? WHERE id=?', [msg, id]);
}

export async function vote(pollId, optionId, userId) {
  const conn = await pool.getConnection();
  try {
    // 🕓 Načti status hlasování
    const [[poll]] = await conn.execute(
      'SELECT status FROM polls WHERE id=?',
      [pollId]
    );

    // 🔒 Pokud není otevřené, hlas odmítnout
    if (!poll || poll.status !== 'open') {
      console.warn(`⚠️ Hlasování ${pollId} není aktivní (${poll?.status || 'neznámé'}).`);
      return false;
    }

    await conn.beginTransaction();

    // 🎯 Najdi, jestli už uživatel hlasoval
    const [[v]] = await conn.execute(
      'SELECT id, option_id FROM poll_votes WHERE poll_id=? AND user_id=? FOR UPDATE',
      [pollId, userId]
    );

    if (v) {
      // 🗳️ Změna hlasu na jinou možnost
      if (v.option_id !== optionId) {
        await conn.execute(
          'UPDATE poll_options SET vote_count=vote_count-1 WHERE id=?',
          [v.option_id]
        );
        await conn.execute(
          'UPDATE poll_votes SET option_id=?, voted_at=NOW() WHERE id=?',
          [optionId, v.id]
        );
        await conn.execute(
          'UPDATE poll_options SET vote_count=vote_count+1 WHERE id=?',
          [optionId]
        );
      } else {
        // 🟡 Stejný hlas → nic se nemění
        await conn.rollback();
        return true;
      }
    } else {
      // 🆕 Nový hlas
      await conn.execute(
        'INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?,?,?)',
        [pollId, optionId, userId]
      );
      await conn.execute(
        'UPDATE poll_options SET vote_count=vote_count+1 WHERE id=?',
        [optionId]
      );
    }

    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback();
    console.error('❌ Chyba při hlasování:', e);
    return false;
  } finally {
    conn.release();
  }
}




export async function deletePollDB(pollId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM poll_votes WHERE poll_id=?', [pollId]);
    await conn.execute('DELETE FROM poll_options WHERE poll_id=?', [pollId]);
    await conn.execute('DELETE FROM polls WHERE id=?', [pollId]);
    await conn.commit();
    console.log('✅ deletePollDB: Hlasování', pollId, 'úspěšně odstraněno z DB.');
    return true;
  } catch (err) {
    await conn.rollback();
    console.error('❌ deletePollDB: Chyba při mazání hlasování:', err);
    return false;
  } finally {
    conn.release();
  }
}

// 🧩 Generování embedů pro hlasování
export function buildEmbed({ question, options, status, end_at }) {
  const totalVotes = options.reduce((sum, o) => sum + Number(o.vote_count || 0), 0);

  // 🟧 Pole s grafy
  const fields = options.map((o, i) => {
    const percent = totalVotes ? ((o.vote_count * 100) / totalVotes).toFixed(1) : 0;
    const barCount = Math.round((percent / 100) * 20);
    const bar = '▰'.repeat(barCount) + '▱'.repeat(20 - barCount);

    const highlight = status === 'closed' && i === 0 && totalVotes > 0 ? '**' : '';
    return {
      name: `${o.emoji ? o.emoji + ' ' : ''}${highlight}${o.label}${highlight}`,
      value: `${bar}\n**${o.vote_count}** hlasů (${percent}%)`,
      inline: false
    };
  });

  // 🕓 Footer text – správný lokální čas
  let footerText = '';
  if (status === 'open') {
    footerText = end_at
      ? `🕓 Konec: ${formatLocalTime(end_at)}`
      : '🕓 Konec: neomezeno';
  } else {
    footerText = '🔒 Hlasování ukončeno';
  }

  // 🎨 Embed (gradient styl)
  const embed = new EmbedBuilder()
    .setColor(status === 'open' ? 0xff6a00 : 0x444444)
    .setTitle(status === 'open' ? '🗳️ Arasaka Vote System' : '🏁 Výsledky hlasování')
    .setThumbnail('https://i.imgur.com/DwZ3ZsQ.png') // můžeš nahradit logem Arasaka
    .setDescription(`**${question}**\n\u200B`)
    .addFields(fields)
    .setFooter({ text: footerText, iconURL: 'https://i.imgur.com/DwZ3ZsQ.png' })
    .setTimestamp();

  // 🎛️ Tlačítka jen když je hlasování otevřené
  const row =
    status === 'open'
      ? new ActionRowBuilder().addComponents(
          ...options.map(o =>
            new ButtonBuilder()
              .setCustomId(`poll:${o.poll_id}:${o.id}`)
              .setLabel(o.label.substring(0, 80))
              .setStyle(ButtonStyle.Primary)
          )
        )
      : [];

  return { embed, components: status === 'open' ? [row] : [] };
}

// 🕒 Pomocná funkce pro správný lokální čas (bez “Z” bugů)
function formatLocalTime(mysqlDateTime) {
  if (!mysqlDateTime) return '';

  let localDate;

  // Pokud je už typu Date
  if (mysqlDateTime instanceof Date) {
    localDate = mysqlDateTime;
  } else if (typeof mysqlDateTime === 'string') {
    const [date, time] = mysqlDateTime.split(' ');
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute, second] = time.split(':').map(Number);
    localDate = new Date(year, month - 1, day, hour, minute, second);
  } else {
    console.warn('⚠️ Neočekávaný typ end_at:', typeof mysqlDateTime);
    return '';
  }

  // ✅ Vrať hezky zformátovaný čas pro českou lokalizaci
  return localDate.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });
}

import { pool } from './db.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// 🧱 Vytvoření hlasování v DB
export async function createPollDB({ guild_id, channel_id, question, options, allow_everyone, created_by, end_at }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pollRes = await client.query(
      `INSERT INTO polls (guild_id, channel_id, question, allow_everyone, created_by, status, end_at)
       VALUES ($1, $2, $3, $4, $5, 'open', $6)
       RETURNING id`,
      [guild_id, channel_id, question, allow_everyone ? 1 : 0, created_by ?? null, end_at ?? null]
    );

    const pollId = pollRes.rows[0].id;

    for (const opt of options) {
      await client.query(
        `INSERT INTO poll_options (poll_id, label, emoji) VALUES ($1, $2, $3)`,
        [pollId, opt.label, opt.emoji ?? null]
      );
    }

    await client.query('COMMIT');
    return pollId;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Chyba při vytváření hlasování:', err);
    throw err;
  } finally {
    client.release();
  }
}

// 📋 Získání hlasování a jeho možností
export async function getPoll(id) {
  try {
    const pollRes = await pool.query(`SELECT * FROM polls WHERE id=$1`, [id]);
    if (!pollRes.rows.length) return null;
    const optionsRes = await pool.query(`SELECT * FROM poll_options WHERE poll_id=$1 ORDER BY id`, [id]);
    return { poll: pollRes.rows[0], options: optionsRes.rows };
  } catch (err) {
    console.error('❌ Chyba v getPoll:', err);
    return null;
  }
}

// 💬 Aktualizace message_id po odeslání hlasování na Discord
export async function setMessageId(id, msgId) {
  await pool.query('UPDATE polls SET message_id=$1 WHERE id=$2', [msgId, id]);
}

// 🗳️ Hlasování uživatele
export async function vote(pollId, optionId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kontrola stavu hlasování
    const pollRes = await client.query(`SELECT status FROM polls WHERE id=$1`, [pollId]);
    const poll = pollRes.rows[0];
    if (!poll || poll.status !== 'open') {
      console.warn(`⚠️ Hlasování ${pollId} není aktivní (${poll?.status || 'neznámé'}).`);
      await client.query('ROLLBACK');
      return false;
    }

    // Zjisti, zda uživatel hlasoval
    const voteRes = await client.query(
      `SELECT id, option_id FROM poll_votes WHERE poll_id=$1 AND user_id=$2 FOR UPDATE`,
      [pollId, userId]
    );

    if (voteRes.rows.length) {
      const v = voteRes.rows[0];

      // Pokud změnil volbu
      if (v.option_id !== optionId) {
        await client.query(`UPDATE poll_options SET vote_count=vote_count-1 WHERE id=$1`, [v.option_id]);
        await client.query(`UPDATE poll_votes SET option_id=$1, voted_at=NOW() WHERE id=$2`, [optionId, v.id]);
        await client.query(`UPDATE poll_options SET vote_count=vote_count+1 WHERE id=$1`, [optionId]);
      } else {
        // Stejný hlas → bez změny
        await client.query('ROLLBACK');
        return true;
      }
    } else {
      // Nový hlas
      await client.query(
        `INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3)`,
        [pollId, optionId, userId]
      );
      await client.query(`UPDATE poll_options SET vote_count=vote_count+1 WHERE id=$1`, [optionId]);
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Chyba při hlasování:', err);
    return false;
  } finally {
    client.release();
  }
}

// 🗑️ Smazání hlasování z DB
export async function deletePollDB(pollId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM poll_votes WHERE poll_id=$1', [pollId]);
    await client.query('DELETE FROM poll_options WHERE poll_id=$1', [pollId]);
    await client.query('DELETE FROM polls WHERE id=$1', [pollId]);
    await client.query('COMMIT');
    console.log('✅ deletePollDB: Hlasování', pollId, 'úspěšně odstraněno z DB.');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ deletePollDB: Chyba při mazání hlasování:', err);
    return false;
  } finally {
    client.release();
  }
}

// 🧩 Generování embedů pro Discord zprávu
export function buildEmbed({ question, options, status, end_at }) {
  const totalVotes = options.reduce((sum, o) => sum + Number(o.vote_count || 0), 0);

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

  const footerText =
    status === 'open'
      ? end_at
        ? `🕓 Konec: ${formatLocalTime(end_at)}`
        : '🕓 Konec: neomezeno'
      : '🔒 Hlasování ukončeno';

  const embed = new EmbedBuilder()
    .setColor(status === 'open' ? 0xff6a00 : 0x444444)
    .setTitle(status === 'open' ? '🗳️ Arasaka Vote System' : '🏁 Výsledky hlasování')
    .setThumbnail('https://i.imgur.com/DwZ3ZsQ.png')
    .setDescription(`**${question}**\n\u200B`)
    .addFields(fields)
    .setFooter({ text: footerText, iconURL: 'https://i.imgur.com/DwZ3ZsQ.png' })
    .setTimestamp();

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

// 🕒 Formátování času
function formatLocalTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });
}

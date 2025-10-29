import { Router } from 'express';
import { requireKey } from './util.js';
import { pool } from './db.js';
import { createPollDB, getPoll, setMessageId, buildEmbed, deletePollDB } from './pollService.js';

export default function makeRoutes(client) {
  const r = Router();

  // 📋 Získání seznamu serverů (guilds)
  r.get('/guilds', requireKey, (req, res) => {
    const guilds = client.guilds.cache.map(g => ({
      id: g.id,
      name: g.name
    }));
    res.json(guilds);
  });

  // 💬 Získání seznamu textových kanálů v guildě
  r.get('/channels', requireKey, async (req, res) => {
    try {
      const { guild_id } = req.query;
      if (!guild_id) return res.status(400).json({ error: 'Missing guild_id' });

      const guild = await client.guilds.fetch(guild_id).catch(() => null);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      const channels = (await guild.channels.fetch())
        .filter(c => c.isTextBased())
        .map(c => ({ id: c.id, name: `#${c.name}` }));

      res.json(channels);
    } catch (err) {
      console.error('❌ Chyba při získávání kanálů:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // 🗳️ Vytvoření nového hlasování
  r.post('/polls', requireKey, async (req, res) => {
    try {
      const {
        guild_id,
        channel_id,
        question,
        options,
        allow_everyone,
        duration_minutes
      } = req.body;

      // 🧩 Validace
      if (
        !guild_id ||
        !channel_id ||
        !question ||
        !Array.isArray(options) ||
        options.length < 2
      ) {
        return res.status(400).json({ error: 'Missing or invalid fields' });
      }

      // 🕒 Spočítat konec hlasování (v SQL formátu)
      let end_at = null;
      if (duration_minutes && !isNaN(duration_minutes)) {
        const endTime = new Date(Date.now() + Number(duration_minutes) * 60_000);
        end_at = new Date(endTime.getTime() - endTime.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ');
      }

      // 💾 Uložit do DB
      const pollId = await createPollDB({
        guild_id,
        channel_id,
        question,
        options,
        allow_everyone,
        created_by: 'web',
        end_at
      });

      // 📤 Odeslat zprávu do kanálu
      const guild = await client.guilds.fetch(guild_id);
      const channel = await guild.channels.fetch(channel_id);
      const { poll, options: opts } = await getPoll(pollId);

      const { embed, components } = buildEmbed({
        question,
        options: opts,
        status: 'open',
        end_at
      });

      const msg = await channel.send({
        content: allow_everyone ? '@everyone' : '',
        embeds: [embed],
        components
      });

      await setMessageId(pollId, msg.id);

      res.json({ success: true, poll_id: pollId });
    } catch (err) {
      console.error('❌ Chyba při vytváření hlasování:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // 📋 Získání všech hlasování
  r.get('/polls', requireKey, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, guild_id, channel_id, question, end_at, created_by, status FROM polls ORDER BY id DESC'
      );
      const rows = result.rows;

      const enriched = await Promise.all(
        rows.map(async (p) => {
          try {
            const guild = await client.guilds.fetch(p.guild_id).catch(() => null);
            const channel = guild ? await guild.channels.fetch(p.channel_id).catch(() => null) : null;

            return {
              ...p,
              guild_name: guild ? guild.name : '(neznámý server)',
              channel_name: channel ? `#${channel.name}` : '(neznámý kanál)',
            };
          } catch {
            return {
              ...p,
              guild_name: '(neznámý)',
              channel_name: '(neznámý)',
            };
          }
        })
      );

      res.json(enriched);
    } catch (err) {
      console.error('❌ Chyba při načítání hlasování:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // 🗑️ Smazání hlasování
  r.delete('/polls/:id', requireKey, async (req, res) => {
    try {
      const pollIdRaw = req.params.id?.trim();
      const pollId = Number(String(pollIdRaw).trim());

      if (!Number.isInteger(pollId) || pollId <= 0) {
        console.warn('❌ Neplatné ID z URL:', req.params.id);
        return res.status(400).json({ error: 'Invalid poll ID' });
      }

      // ✅ Načtení hlasování
      const pollData = await getPoll(pollId);
      if (!pollData) {
        console.warn('⚠️ Hlasování s ID', pollId, 'nenalezeno v DB.');
        return res.status(404).json({ error: 'Poll not found (getPoll returned null)' });
      }

      const { poll } = pollData;

      // ⚙️ Pokus o smazání zprávy z Discordu
      try {
        const guild = await client.guilds.fetch(poll.guild_id);
        const channel = await guild.channels.fetch(poll.channel_id);
        const msg = await channel.messages.fetch(poll.message_id);
        await msg.delete();
        console.log('🗑️ Zpráva na Discordu byla úspěšně smazána.');
      } catch (err) {
        console.warn('⚠️ Nepodařilo se smazat zprávu z Discordu:', err.message);
      }

      // 💾 Smazání z DB
      const deleted = await deletePollDB(pollId);
      if (!deleted) {
        console.warn('⚠️ Databázové smazání hlasování selhalo.');
        return res.status(500).json({ error: 'Database delete failed' });
      }

      console.log('✅ Hlasování', pollId, 'úspěšně smazáno.');
      res.json({ success: true });
    } catch (err) {
      console.error('❌ Chyba při mazání hlasování:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return r;
}

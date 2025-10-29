import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import makeRoutes from './routes.js';
import { getPoll, vote, buildEmbed } from './pollService.js';
import { pool } from './db.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();

app.use(cors());
app.use(express.json());

// REST API bota
app.use('/api', makeRoutes(client));

// 🧩 Interakce s hlasováním (kliknutí na tlačítko)
client.on('interactionCreate', async (i) => {
  try {
    if (!i.isButton()) return;
    if (!i.customId.startsWith('poll:')) return;

    const parts = i.customId.split(':');
    const pollId = parts[1];
    const optionId = parts[2];

    const ok = await vote(pollId, optionId, i.user.id);
    if (!ok) {
      return i.reply({
        content: '🔒 Toto hlasování už bylo ukončeno.',
        flags: 64 // EPHEMERAL (nahrazuje deprecated "ephemeral: true")
      });
    }

    const { poll, options } = await getPoll(pollId);
    const { embed, components } = buildEmbed({
      question: poll.question,
      options,
      status: poll.status,
      end_at: poll.end_at
    });

    const channel = await client.channels.fetch(poll.channel_id);
    const msg = await channel.messages.fetch(poll.message_id);
    await msg.edit({ embeds: [embed], components });

    await i.reply({
      content: '✅ Tvůj hlas byl zaznamenán.',
      flags: 64 // EPHEMERAL
    });
  } catch (e) {
    console.error('❌ Chyba při zpracování hlasování:', e);
    if (i.isRepliable()) {
      try {
        await i.reply({
          content: '⚠️ Nastala chyba při zpracování hlasu.',
          flags: 64
        });
      } catch {}
    }
  }
});

// 🕓 Automatická kontrola ukončených hlasování
async function checkPolls() {
  try {
    const result = await pool.query(
      "SELECT id, guild_id, channel_id, message_id, question, end_at, status FROM polls WHERE status='open' AND end_at IS NOT NULL"
    );

    const polls = result.rows;
    const now = new Date();

    for (const poll of polls) {
      if (!poll.end_at) continue;

      // 🧩 Ošetření formátu end_at (Date nebo string)
      let endTime;
      if (poll.end_at instanceof Date) {
        endTime = poll.end_at;
      } else if (typeof poll.end_at === 'string') {
        const [date, time] = poll.end_at.split(' ');
        const [year, month, day] = date.split('-').map(Number);
        const [hour, minute, second] = time.split(':').map(Number);
        endTime = new Date(year, month - 1, day, hour, minute, second);
      } else {
        console.warn(`⚠️ Neznámý formát end_at u hlasování ${poll.id}:`, poll.end_at);
        continue;
      }

      console.log(
        `🕒 Kontrola ${poll.id}: nyní=${now.toLocaleString('cs-CZ')} | konec=${endTime.toLocaleString('cs-CZ')}`
      );

      // ⏰ Pokud skončilo
      if (now >= endTime) {
        console.log(`⏰ Ukončuji hlasování ID ${poll.id}`);
        await pool.query("UPDATE polls SET status='closed' WHERE id=$1", [poll.id]);

        // 📊 Načti detaily
        const { poll: pollData, options } = await getPoll(poll.id);
        const sorted = [...options].sort((a, b) => b.vote_count - a.vote_count);
        const totalVotes = options.reduce((sum, o) => sum + Number(o.vote_count || 0), 0);
        const medals = ['🥇', '🥈', '🥉'];

        // 🎨 Arasaka stylový embed s výsledky
        const embed = new EmbedBuilder()
          .setColor(0xff3c00)
          .setTitle('🏁 Arasaka Vote Results')
          .setThumbnail('https://i.imgur.com/DwZ3ZsQ.png')
          .setDescription(`**Otázka:** ${pollData.question}\n\u200B`)
          .addFields(
            sorted.map((opt, i) => {
              const percent = totalVotes ? ((opt.vote_count * 100) / totalVotes).toFixed(1) : 0;
              const barCount = Math.round((percent / 100) * 20);
              const bar = '▰'.repeat(barCount) + '▱'.repeat(20 - barCount);
              const medal = medals[i] || '•';
              const highlight = i === 0 ? '**' : '';

              return {
                name: `${medal} ${opt.emoji ? opt.emoji + ' ' : ''}${highlight}${opt.label}${highlight}`,
                value: `${bar}\n**${opt.vote_count}** hlasů (${percent}%)`,
                inline: false
              };
            })
          )
          .setFooter({
            text: `🔒 Hlasování uzavřeno — ${endTime.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}`,
            iconURL: 'https://i.imgur.com/DwZ3ZsQ.png'
          })
          .setTimestamp();

        try {
          const guild = await client.guilds.fetch(poll.guild_id);
          const channel = await guild.channels.fetch(poll.channel_id);
          const msg = await channel.messages.fetch(poll.message_id);

          await msg.edit({ embeds: [embed], components: [] });
          console.log(`✅ Hlasování ${poll.id} uzavřeno – vítěz: ${sorted[0].label}`);
        } catch (err) {
          console.warn(`⚠️ Nelze aktualizovat zprávu ${poll.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('❌ Chyba při kontrole hlasování:', err);
  }
}


// 🧠 Spustí se, když je bot připraven
client.once('ready', () => {
  console.log(`✅ Přihlášen jako ${client.user.tag}`);
  checkPolls();
  setInterval(checkPolls, 60 * 1000);
});

// 🌐 Spuštění Express serveru a přihlášení bota
app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 API běží na portu ${process.env.PORT || 3000}`);
  client.login(process.env.DISCORD_TOKEN);
});

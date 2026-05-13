require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
} = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");

const OpenAI = require("openai");

const { ALLOWED_GUILD_IDS } = require("./allowed-guilds");

let openai;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

function validateEnv() {
  const required = [
    "DISCORD_TOKEN",
    "OPENAI_API_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

function initializeOpenAI() {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function createTranslationPrompt(text) {
  const normalizedText = text
    .replace(/[?!]{2,}/g, (match) => {
      if (match.includes("?") && match.includes("!")) return "?!";
      return match[0];
    })
    .replace(/\.{2,}/g, ".")
    .trim();

  return [
    "Translate this Bisaya/Cebuano chat text.",
    "",
    "Raw text:",
    text,
    "",
    "Normalized reading hint:",
    normalizedText,
    "",
    "Use the raw text as the source of truth. Use the normalized hint only to understand noisy punctuation or repeated characters.",
    "Preserve @mentions exactly, but translate the Bisaya/Cebuano words around them.",
  ].join("\n");
}

async function translateCebuano(text) {
  const response = await openai.responses.create({
    model: "gpt-5.4-nano",
    input: [
      {
        role: "system",
        content:
          "You are a professional Bisaya/Cebuano translator. Translate Cebuano, Bisaya, and mixed Visayan text into natural Filipino and English. Dig deeper than literal word-for-word translation: infer idioms, slang, contractions, regional phrasing, tone, humor, emotion, and implied meaning from context. Recognize informal Bisaya/Cebuano contractions, merged particles, noisy punctuation, repeated punctuation, repeated letters, and shortened or misspelled chat spellings. Expand them mentally before translating when needed. For example, \"samani\" may mean \"unsa na man ni\" or \"unsa na mani\", and \"onsa??!!!!\" should be read as a noisy casual spelling of \"unsa?!\". Treat personal names, usernames, mentions, and nicknames as names even when they appear next to Bisaya words, such as \"maayong adlaw Juan\" or \"adlaw Mark\". Preserve the name or mention exactly, but still translate the Bisaya/Cebuano words around it. For example, \"bayot @user\" should translate \"bayot\" while preserving \"@user\"; do not copy the whole phrase unchanged just because it contains a mention. Preserve emojis, profanity intensity, punctuation intensity, and speaker intent. Particles like \"na\", \"man\", \"ni\", \"ba\", \"diay\", \"lagi\", and \"jud/gyud\" may be attached, omitted, or misspelled in casual chat. If the text is ambiguous, choose the most likely conversational meaning. Return only valid JSON.",
      },
      {
        role: "user",
        content: createTranslationPrompt(text),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "translation_result",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            filipino: {
              type: "string",
              description: "Natural Filipino translation.",
            },
            english: {
              type: "string",
              description: "Natural English translation.",
            },
          },
          required: ["filipino", "english"],
        },
      },
    },
  });

  return JSON.parse(response.output_text);
}

function createTranslationEmbed(text, result) {
  return new EmbedBuilder()
    .setTitle("Cebuano Translation")
    .setColor(0x3498db)
    .addFields(
      {
        name: "Original Cebuano",
        value: text.slice(0, 1024) || "No text provided.",
      },
      {
        name: "Filipino",
        value: result.filipino.slice(0, 1024) || "No Filipino translation.",
      },
      {
        name: "English",
        value: result.english.slice(0, 1024) || "No English translation.",
      }
    )
    .setFooter({
      text: "Translated using OpenAI",
    });
}

async function handleJoinVoiceCommand(interaction) {
  const voiceChannel = interaction.member?.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: "Join a voice channel first, then run `/joinvoice`.",
      ephemeral: true,
    });
    return;
  }

  try {
    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });

    await interaction.reply({
      content: `Joined ${voiceChannel.name} muted.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Failed to join voice channel:", error);

    await interaction.reply({
      content:
        "Sorry, I could not join that voice channel. Check my voice permissions.",
      ephemeral: true,
    });
  }
}

async function handleJoinVoiceMessage(message) {
  const voiceChannel = message.member?.voice?.channel;

  if (!voiceChannel) {
    await message.reply("Join a voice channel first, then type `<join`.");
    return;
  }

  try {
    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });

    await message.reply(`Joined ${voiceChannel.name} muted.`);
  } catch (error) {
    console.error("Failed to join voice channel:", error);

    await message.reply(
      "Sorry, I could not join that voice channel. Check my voice permissions."
    );
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot is online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!ALLOWED_GUILD_IDS.includes(interaction.guildId)) {
    await interaction.reply({
      content: "This bot is not enabled for this server.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "joinvoice") {
    await handleJoinVoiceCommand(interaction);
    return;
  }

  if (interaction.commandName !== "translate") return;

  const text = interaction.options.getString("text", true);

  if (text.length > 1500) {
    await interaction.reply({
      content: "Please send a shorter Cebuano text, up to 1500 characters.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await translateCebuano(text);
    const embed = createTranslationEmbed(text, result);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Translation error:", error);

    await interaction.editReply(
      "Sorry, I could not translate that text right now. Please try again."
    );
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!ALLOWED_GUILD_IDS.includes(message.guildId)) return;

  if (message.content.trim() === "<join") {
    await handleJoinVoiceMessage(message);
    return;
  }

  if (message.content.trim() !== "<translate") return;

  if (!message.reference?.messageId) {
    await message.reply("Reply to a Cebuano message with `<translate`.");
    return;
  }

  let sourceMessage;

  try {
    sourceMessage = await message.channel.messages.fetch(
      message.reference.messageId
    );
  } catch (error) {
    console.error("Failed to fetch referenced message:", error);
    await message.reply("Sorry, I could not read the message you replied to.");
    return;
  }

  const text = sourceMessage.content.trim();

  if (!text) {
    await message.reply("The message you replied to does not contain text.");
    return;
  }

  if (text.length > 1500) {
    await message.reply(
      "Please reply to a shorter Cebuano text, up to 1500 characters."
    );
    return;
  }

  const reply = await message.reply("Translating...");

  try {
    const result = await translateCebuano(text);
    const embed = createTranslationEmbed(text, result);

    await reply.edit({ content: "", embeds: [embed] });
  } catch (error) {
    console.error("Translation error:", error);

    await reply.edit(
      "Sorry, I could not translate that text right now. Please try again."
    );
  }
});

async function main() {
  validateEnv();
  initializeOpenAI();

  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error("Failed to start Discord bot:", error);
    process.exitCode = 1;
  }
}

main();
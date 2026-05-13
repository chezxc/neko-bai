require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const { ALLOWED_GUILD_IDS } = require("./allowed-guilds");

const commands = [
  new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate Cebuano text to Filipino and English")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Cebuano text to translate")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("joinvoice")
    .setDescription("Join your voice channel muted")
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

function validateEnv() {
  const required = [
    "DISCORD_TOKEN",
    "DISCORD_CLIENT_ID",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

async function main() {
  try {
    validateEnv();

    console.log("Registering slash commands...");

    await Promise.all(
      ALLOWED_GUILD_IDS.map((guildId) =>
        rest.put(
          Routes.applicationGuildCommands(
            process.env.DISCORD_CLIENT_ID,
            guildId
          ),
          { body: commands }
        )
      )
    );

    console.log("Slash command registered successfully.");
  } catch (error) {
    console.error("Failed to register slash commands:");
    console.error(error);
    process.exitCode = 1;
  }
}

main();
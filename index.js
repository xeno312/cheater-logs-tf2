const {
  Client,
  IntentsBitField,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// Initialize Discord client
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

// Paths for data storage
const cheatersFile = path.join(__dirname, 'cheaters.json');
const logsFile = path.join(__dirname, 'logs.json');
const configFile = path.join(__dirname, 'config.json');

// Load or initialize data
let cheaters = [];
let logs = [];
let config = { cheaterChannelId: null, addCheaterEveryone: false };

function loadData(file, defaultData) {
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(data) || typeof data === 'object' ? data : defaultData;
    }
  } catch (error) {
    console.error(`ข้อผิดพลาดในการโหลด ${file}:`, error);
  }
  fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
  return defaultData;
}
cheaters = loadData(cheatersFile, []);
logs = loadData(logsFile, []);
config = loadData(configFile, config);

// Save data to files
function saveData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`ข้อผิดพลาดในการบันทึก ${file}:`, error);
  }
}
function saveCheaters() {
  saveData(cheatersFile, cheaters);
}
function saveLogs() {
  saveData(logsFile, logs);
}
function saveConfig() {
  saveData(configFile, config);
}

// Log actions
function logAction(action, details, user) {
  try {
    logs.push({
      action,
      details,
      user: user.tag,
      timestamp: new Date().toISOString(),
    });
    saveLogs();
  } catch (error) {
    console.error('ข้อผิดพลาดในการบันทึก log:', error);
  }
}

// Send message to cheater channel
async function sendToCheaterChannel(embed, components = []) {
  if (!config.cheaterChannelId) return null;
  try {
    const channel = await client.channels.fetch(config.cheaterChannelId);
    if (
      channel &&
      channel.isTextBased() &&
      channel.permissionsFor(client.user).has(PermissionsBitField.Flags.SendMessages)
    ) {
      return await channel.send({ embeds: [embed], components });
    }
  } catch (error) {
    console.error('ข้อผิดพลาดในการส่งข้อความถึงช่องผู้โกง:', error.message);
  }
  return null;
}

// Validate SteamID64
function isValidSteamID(steamID) {
  return /^\d{17}$/.test(steamID.trim());
}

// Bot ready event
client.on('ready', async () => {
  console.log(`ล็อกอินเป็น ${client.user.tag}!`);

  // Register slash commands
  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('สร้างช่องสำหรับจัดการผู้โกง TF2 และตั้งค่าระบบ (แอดมินเท่านั้น)')
      .addBooleanOption((option) =>
        option
          .setName('addcheatereveryone')
          .setDescription('อนุญาตให้ทุกคนเพิ่มผู้โกงได้หรือไม่ (ค่าเริ่มต้น: เฉพาะแอดมิน)')
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  ].map((command) => command.toJSON());

  try {
    await client.application.commands.set(commands);
    console.log('ลงทะเบียนคำสั่ง Slash เสร็จสิ้น!');
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการลงทะเบียนคำสั่ง:', error);
  }
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

  const checkChannel = () => {
    if (!config.cheaterChannelId) {
      return 'ยังไม่ได้ตั้งค่าช่องสำหรับจัดการผู้โกง! ใช้คำสั่ง /setup เพื่อสร้างช่อง';
    }
    if (interaction.channelId !== config.cheaterChannelId) {
      return `กรุณาใช้การกระทำนี้ในช่อง <#${config.cheaterChannelId}> เท่านั้น!`;
    }
    return null;
  };

  // Handle slash commands
  if (interaction.isCommand()) {
    const { commandName, options, member, user } = interaction;

    // /setup
    if (commandName === 'setup') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: 'คุณต้องมีสิทธิ์แอดมินเพื่อใช้คำสั่งนี้!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const addCheaterEveryone = options.getBoolean('addcheatereveryone') || false;
      const updates = [];

      // Create cheater channel
      try {
        const existingChannel = interaction.guild.channels.cache.find(
          (ch) => ch.name === 'tf2-cheater-logs' && ch.type === ChannelType.GuildText
        );
        if (existingChannel) {
          return interaction.reply({
            content: 'ช่อง tf2-cheater-logs มีอยู่แล้ว! กรุณาลบช่องเดิมก่อนสร้างใหม่',
            flags: MessageFlags.Ephemeral,
          });
        }

        const channel = await interaction.guild.channels.create({
          name: 'tf2-cheater-logs',
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionsBitField.Flags.SendMessages],
              allow: [PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: client.user.id,
              allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: member.id,
              allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel],
            },
          ],
        });
        config.cheaterChannelId = channel.id;
        updates.push(`สร้างช่องสำหรับจัดการผู้โกง: ${channel}`);
      } catch (error) {
        console.error('ข้อผิดพลาดในการสร้างช่อง:', error);
        return interaction.reply({
          content: 'เกิดข้อผิดพลาดในการสร้างช่อง! กรุณาลองใหม่',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Update config
      config.addCheaterEveryone = addCheaterEveryone;
      updates.push(`ตั้งค่าการเพิ่มผู้โกงให้${addCheaterEveryone ? 'ทุกคนใช้ได้' : 'แอดมินเท่านั้น'}`);
      saveConfig();
      logAction('ตั้งค่าระบบ', { updates }, user);

      // Send welcome embed with command buttons
      const welcomeEmbed = new EmbedBuilder()
        .setColor('#32CD32')
        .setTitle('⚙ ยินดีต้อนรับสู่ระบบจัดการผู้โกง TF2!')
        .setDescription(
          'ใช้ปุ่มด้านล่างเพื่อจัดการผู้โกง:\n' +
          '🔥 **เพิ่มผู้โกง**: กรอก SteamID64, เหตุผล, และหลักฐาน\n' +
          '📜 **ดูรายชื่อผู้โกง**: ดูรายชื่อผู้โกงทั้งหมด\n' +
          '🗑 **ลบผู้โกง**: ลบผู้โกงออกจากรายชื่อ (แอดมินเท่านั้น)\n' +
          '✏️ **แก้ไขผู้โกง**: แก้ไขข้อมูลผู้โกง (แอดมินเท่านั้น)'
        )
        .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
        .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('add_cheater')
          .setLabel('เพิ่มผู้โกง')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔥'),
        new ButtonBuilder()
          .setCustomId('list_cheaters')
          .setLabel('ดูรายชื่อผู้โกง')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📜'),
        new ButtonBuilder()
          .setCustomId('remove_cheater')
          .setLabel('ลบผู้โกง')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️'),
        new ButtonBuilder()
          .setCustomId('edit_cheater')
          .setLabel('แก้ไขผู้โกง')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✏️')
      );

      await interaction.reply({ embeds: [welcomeEmbed], flags: MessageFlags.Ephemeral });
      await sendToCheaterChannel(welcomeEmbed, [buttonRow]);
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    const channelCheck = checkChannel();
    if (channelCheck) {
      return interaction.reply({ content: channelCheck, flags: MessageFlags.Ephemeral });
    }

    const { customId, user, member } = interaction;

    // Add cheater button
    if (customId === 'add_cheater') {
      if (!config.addCheaterEveryone && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: 'คุณต้องมีสิทธิ์แอดมินเพื่อเพิ่มผู้โกง!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`add_cheater_modal_${user.id}`)
        .setTitle('เพิ่มผู้โกง');

      const steamIdInput = new TextInputBuilder()
        .setCustomId('steamid')
        .setLabel('SteamID64 (17 หลัก)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('เหตุผลที่เพิ่มผู้โกง')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const evidenceInput = new TextInputBuilder()
        .setCustomId('evidence')
        .setLabel('ลิงก์หลักฐาน (ถ้ามี)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(steamIdInput),
        new ActionRowBuilder().addComponents(reasonInput),
        new ActionRowBuilder().addComponents(evidenceInput)
      );

      await interaction.showModal(modal);
    }

    // List cheaters button
    if (customId === 'list_cheaters') {
      if (cheaters.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#1E90FF')
          .setTitle('📜 รายชื่อผู้โกง TF2')
          .setDescription('ยังไม่มีผู้โกงในรายชื่อ!')
          .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
          .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
      }

      const ITEMS_PER_PAGE = 5;
      const totalPages = Math.ceil(cheaters.length / ITEMS_PER_PAGE);
      let currentPage = 1;

      const generateEmbed = (page) => {
        const start = (page - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageCheaters = cheaters.slice(start, end);

        const embed = new EmbedBuilder()
          .setColor('#1E90FF')
          .setTitle('📜 รายชื่อผู้โกง TF2')
          .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
          .setDescription(
            pageCheaters
              .map(
                (cheater, index) =>
                  `**${start + index + 1}.** 🆔 ${cheater.steamID}\n📝 ${cheater.reason}\n📎 ${cheater.evidence}`
              )
              .join('\n\n')
          )
          .setFooter({ text: `หน้า ${page}/${totalPages} | TF2 Anti-Cheater Bot`, iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`prev_page_${user.id}`)
            .setLabel('ย้อนกลับ')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 1),
          new ButtonBuilder()
            .setCustomId(`next_page_${user.id}`)
            .setLabel('ถัดไป')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === totalPages),
          new ButtonBuilder()
            .setCustomId(`details_page_${page}_${user.id}`)
            .setLabel('ดูรายละเอียด')
            .setStyle(ButtonStyle.Secondary)
        );

        return { embed, row };
      };

      const { embed, row } = generateEmbed(currentPage);
      const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

      const collector = message.channel.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === user.id && ['prev_page', 'next_page', 'details_page'].some((id) => i.customId.startsWith(id)),
        time: 300000, // 5 minutes
      });

      collector.on('collect', async (i) => {
        if (i.customId.startsWith('prev_page') && currentPage > 1) {
          currentPage--;
        } else if (i.customId.startsWith('next_page') && currentPage < totalPages) {
          currentPage++;
        } else if (i.customId.startsWith('details_page')) {
          const start = (currentPage - 1) * ITEMS_PER_PAGE;
          const pageCheaters = cheaters.slice(start, start + ITEMS_PER_PAGE);

          const detailEmbeds = pageCheaters.map((cheater, index) =>
            new EmbedBuilder()
              .setColor('#1E90FF')
              .setTitle(`📋 รายละเอียดผู้โกง #${start + index + 1}`)
              .addFields(
                { name: '🆔 SteamID64', value: cheater.steamID, inline: true },
                { name: '📝 เหตุผล', value: cheater.reason, inline: true },
                { name: '📎 หลักฐาน', value: cheater.evidence, inline: true },
                { name: '👤 เพิ่มโดย', value: cheater.addedBy, inline: true },
                {
                  name: '📅 วันที่',
                  value: `<t:${Math.floor(new Date(cheater.date).getTime() / 1000)}:R>`,
                  inline: true,
                }
              )
              .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
              .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
              .setTimestamp()
          );

          await i.reply({ embeds: detailEmbeds, flags: MessageFlags.Ephemeral });
          return;
        }

        const { embed, row } = generateEmbed(currentPage);
        await i.update({ embeds: [embed], components: [row] });
      });

      collector.on('end', async () => {
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`prev_page_${user.id}`)
            .setLabel('ย้อนกลับ')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`next_page_${user.id}`)
            .setLabel('ถัดไป')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`details_page_${user.id}`)
            .setLabel('ดูรายละเอียด')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
        try {
          await message.edit({ components: [disabledRow] });
        } catch (error) {
          console.error('ข้อผิดพลาดในการปิดใช้งานปุ่ม:', error);
        }
      });
    }

    // Remove cheater button
    if (customId === 'remove_cheater') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: 'คุณต้องมีสิทธิ์แอดมินเพื่อลบผู้โกง!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`remove_cheater_modal_${user.id}`)
        .setTitle('ลบผู้โกง');

      const steamIdInput = new TextInputBuilder()
        .setCustomId('steamid')
        .setLabel('SteamID64 (17 หลัก)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(steamIdInput));

      await interaction.showModal(modal);
    }

    // Edit cheater button
    if (customId === 'edit_cheater') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: 'คุณต้องมีสิทธิ์แอดมินเพื่อแก้ไขผู้โกง!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`edit_cheater_modal_${user.id}`)
        .setTitle('แก้ไขผู้โกง');

      const steamIdInput = new TextInputBuilder()
        .setCustomId('steamid')
        .setLabel('SteamID64 (17 หลัก)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('เหตุผลใหม่ (ถ้าต้องการเปลี่ยน)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const evidenceInput = new TextInputBuilder()
        .setCustomId('evidence')
        .setLabel('ลิงก์หลักฐานใหม่ (ถ้าต้องการเปลี่ยน)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(steamIdInput),
        new ActionRowBuilder().addComponents(reasonInput),
        new ActionRowBuilder().addComponents(evidenceInput)
      );

      await interaction.showModal(modal);
    }

    // Confirm or cancel buttons
    const [action, type, ...params] = customId.split('_');
    const userId = params[params.length - 1];

    if (['confirm', 'cancel'].includes(action) && interaction.user.id !== userId) {
      return interaction.reply({
        content: 'คุณไม่สามารถใช้ปุ่มนี้ได้! เฉพาะผู้ที่เริ่มคำสั่งเท่านั้นที่กดได้',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Confirm add cheater
    if (action === 'confirm' && type === 'add') {
      const steamID = params[0];
      const reason = decodeURIComponent(params[2]);
      const evidence = decodeURIComponent(params[3]);

      if (cheaters.some((cheater) => cheater.steamID === steamID)) {
        const embed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle('❌ ข้อผิดพลาด')
          .setDescription('SteamID นี้อยู่ในรายชื่อผู้โกงแล้ว!')
          .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
          .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        return;
      }

      cheaters.push({
        steamID,
        reason,
        evidence,
        addedBy: interaction.user.tag,
        date: new Date().toISOString(),
      });
      saveCheaters();

      logAction('เพิ่มผู้โกง', { steamID, reason, evidence }, interaction.user);

      const embed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🔥 เพิ่มผู้โกงเรียบร้อย!')
        .addFields(
          { name: '🆔 SteamID64', value: steamID, inline: true },
          { name: '📝 เหตุผล', value: reason, inline: true },
          { name: '📎 หลักฐาน', value: evidence, inline: true },
          { name: '👤 เพิ่มโดย', value: interaction.user.tag, inline: true },
          { name: '📅 วันที่', value: `<t:${Math.floor(new Date().getTime() / 1000)}:R>`, inline: true }
        )
        .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
        .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.update({ embeds: [embed], components: [] });
      await sendToCheaterChannel(embed);
    }

    // Confirm remove cheater
    if (action === 'confirm' && type === 'remove') {
      const steamID = params[0];
      const index = cheaters.findIndex((cheater) => cheater.steamID === steamID);
      if (index === -1) {
        const embed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle('❌ ข้อผิดพลาด')
          .setDescription('ไม่พบ SteamID นี้ในรายชื่อผู้โกง!')
          .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
          .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        return;
      }

      const removedCheater = cheaters.splice(index, 1)[0];
      saveCheaters();

      logAction('ลบผู้โกง', { steamID, reason: removedCheater.reason }, interaction.user);

      const embed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🗑️ ลบผู้โกงเรียบร้อย!')
        .addFields(
          { name: '🆔 SteamID64', value: steamID, inline: true },
          { name: '📝 เหตุผลเดิม', value: removedCheater.reason, inline: true },
          { name: '👤 ลบโดย', value: interaction.user.tag, inline: true },
          { name: '📅 วันที่', value: `<t:${Math.floor(new Date().getTime() / 1000)}:R>`, inline: true }
        )
        .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
        .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.update({ embeds: [embed], components: [] });
      await sendToCheaterChannel(embed);
    }

    // Confirm edit cheater
    if (action === 'confirm' && type === 'edit') {
      const steamID = params[0];
      const newReason = decodeURIComponent(params[2]);
      const newEvidence = decodeURIComponent(params[3]);

      const cheater = cheaters.find((cheater) => cheater.steamID === steamID);
      if (!cheater) {
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('❌ ข้อผิดพลาด')
          .setDescription('ไม่พบ SteamID นี้ในรายชื่อผู้โกง!')
          .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
          .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        return;
      }

      const oldDetails = { reason: cheater.reason, evidence: cheater.evidence };
      cheater.reason = newReason;
      cheater.evidence = newEvidence;
      saveCheaters();

      logAction(
        'แก้ไขผู้โกง',
        { steamID, oldDetails, newDetails: { reason: newReason, evidence: newEvidence } },
        interaction.user
      );

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('✏️ แก้ไขข้อมูลผู้โกงเรียบร้อย!')
        .addFields(
          { name: '🆔 SteamID64', value: steamID, inline: true },
          { name: '📝 เหตุผลใหม่', value: newReason, inline: true },
          { name: '📎 หลักฐานใหม่', value: newEvidence, inline: true },
          { name: '👤 แก้ไขโดย', value: interaction.user.tag, inline: true },
          { name: '📅 วันที่', value: `<t:${Math.floor(new Date().getTime() / 1000)}:R>`, inline: true }
        )
        .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
        .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.update({ embeds: [embed], components: [] });
      await sendToCheaterChannel(embed);
    }

    // Cancel action
    if (action === 'cancel') {
      const embed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('❌ ยกเลิกการดำเนินการ')
        .setDescription('การดำเนินการถูกยกเลิกเรียบร้อย')
        .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
        .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.update({ embeds: [embed], components: [] });
    }
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    const channelCheck = checkChannel();
    if (channelCheck) {
      return interaction.reply({ content: channelCheck, flags: MessageFlags.Ephemeral });
    }

    const [action, type, userId] = interaction.customId.split('_');
    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: 'คุณไม่สามารถส่งข้อมูลนี้ได้! เฉพาะผู้ที่เริ่มคำสั่งเท่านั้น',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Add cheater modal
    if (action === 'add' && type === 'cheater') {
      const steamID = interaction.fields.getTextInputValue('steamid').trim();
      const reason = interaction.fields.getTextInputValue('reason');
      const evidence = interaction.fields.getTextInputValue('evidence') || 'ไม่มี';

      if (!isValidSteamID(steamID)) {
        return interaction.reply({
          content: 'SteamID64 ไม่ถูกต้อง! ต้องเป็นตัวเลข 17 หลัก',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (cheaters.some((cheater) => cheater.steamID === steamID)) {
        return interaction.reply({
          content: 'SteamID นี้อยู่ในรายชื่อผู้โกงแล้ว!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🔥 ยืนยันการเพิ่มผู้โกง')
        .setDescription('กรุณาตรวจสอบข้อมูลก่อนยืนยัน')
        .addFields(
          { name: '🆔 SteamID64', value: steamID, inline: true },
          { name: '📝 เหตุผล', value: reason, inline: true },
          { name: '📎 หลักฐาน', value: evidence, inline: true },
          { name: '👤 เพิ่มโดย', value: interaction.user.tag, inline: true }
        )
        .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
        .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_add_${steamID}_${userId}_${encodeURIComponent(reason)}_${encodeURIComponent(evidence)}`)
          .setLabel('ยืนยัน')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cancel_add_${userId}`)
          .setLabel('ยกเลิก')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [confirmEmbed], components: [row] });
    }

    // Remove cheater modal
    if (action === 'remove' && type === 'cheater') {
      const steamID = interaction.fields.getTextInputValue('steamid').trim();

      if (!isValidSteamID(steamID)) {
        return interaction.reply({
          content: 'SteamID64 ไม่ถูกต้อง! ต้องเป็นตัวเลข 17 หลัก',
          flags: MessageFlags.Ephemeral,
        });
      }

      const index = cheaters.findIndex((cheater) => cheater.steamID === steamID);
      if (index === -1) {
        return interaction.reply({
          content: 'ไม่พบ SteamID นี้ในรายชื่อผู้โกง!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🗑️ ยืนยันการลบผู้โกง')
        .setDescription('คุณแน่ใจหรือไม่ว่าจะลบผู้โกงนี้?')
        .addFields(
          { name: '🆔 SteamID64', value: steamID, inline: true },
          { name: '📝 เหตุผล', value: cheaters[index].reason, inline: true },
          { name: '👤 ลบโดย', value: interaction.user.tag, inline: true }
        )
        .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
        .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_remove_${steamID}_${userId}`)
          .setLabel('ยืนยัน')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cancel_remove_${userId}`)
          .setLabel('ยกเลิก')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [confirmEmbed], components: [row] });
    }

    // Edit cheater modal
    if (action === 'edit' && type === 'cheater') {
      const steamID = interaction.fields.getTextInputValue('steamid').trim();
      const newReason = interaction.fields.getTextInputValue('reason');
      const newEvidence = interaction.fields.getTextInputValue('evidence');

      if (!isValidSteamID(steamID)) {
        return interaction.reply({
          content: 'SteamID64 ไม่ถูกต้อง! ต้องเป็นตัวเลข 17 หลัก',
          flags: MessageFlags.Ephemeral,
        });
      }

      const cheater = cheaters.find((cheater) => cheater.steamID === steamID);
      if (!cheater) {
        return interaction.reply({
          content: 'ไม่พบ SteamID นี้ในรายชื่อผู้โกง!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('✏️ ยืนยันการแก้ไขผู้โกง')
        .setDescription('กรุณาตรวจสอบข้อมูลใหม่ก่อนยืนยัน')
        .addFields(
          { name: '🆔 SteamID64', value: steamID, inline: true },
          { name: '📝 เหตุผลใหม่', value: newReason || cheater.reason, inline: true },
          { name: '📎 หลักฐานใหม่', value: newEvidence || cheater.evidence, inline: true },
          { name: '👤 แก้ไขโดย', value: interaction.user.tag, inline: true }
        )
        .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/4/4a/Team_Fortress_2_Logo.png/250px-Team_Fortress_2_Logo.png')
        .setFooter({ text: 'TF2 Anti-Cheater Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_edit_${steamID}_${userId}_${encodeURIComponent(newReason || cheater.reason)}_${encodeURIComponent(newEvidence || cheater.evidence)}`)
          .setLabel('ยืนยัน')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cancel_edit_${userId}`)
          .setLabel('ยกเลิก')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [confirmEmbed], components: [row] });
    }
  }
});

// Log in to Discord
client.login('YOUR_BOT_TOKEN'); // แทนที่ด้วยโทเค็นของบอท

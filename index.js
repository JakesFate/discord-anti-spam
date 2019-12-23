if (Number(process.version.split('.')[0].match(/[0-9]+/)) < 10)
	throw new Error('Node 10.0.0 or higher is required. Update Node on your system.');
const { RichEmbed, GuildMember, Message } = require('discord.js');
const { EventEmitter } = require('events');

/**
 * Options for AntiSpam instance
 * 
 * @typedef {Object} AntiSpamOptions
 * 
 * @property {number} [warnThreshold=3] Amount of messages sent in a row that will cause a warning.
 * @property {number} [kickThreshold=5] Amount of messages sent in a row that will cause a kick.
 * @property {number} [warnThreshold=7] Amount of messages sent in a row that will cause a ban.
 * 
 * @property {number} [maxInterval=2000] Amount of time (ms) in which messages are considered spam.
 * 
 * @property {string|RichEmbed} [warnMessage='{@user}, Please stop spamming.'] Message that will be sent in chat upon warning a user.
 * @property {string|RichEmbed} [kickMessage='**{user_tag}** has been kicked for spamming.'] Message that will be sent in chat upon kicking a user.
 * @property {string|RichEmbed} [banMessage='**{user_tag}** has been banned for spamming.'] Message that will be sent in chat upon banning a user.
 * 
 * @property {number} [maxDuplicatesWarning=7] Amount of duplicate messages that trigger a warning.
 * @property {number} [maxDuplicatesKick=10] Amount of duplicate messages that trigger a kick.
 * @property {number} [maxDuplicatesBan=10] Amount of duplicate messages that trigger a ban.
 * 
 * @property {number} [deleteMessagesAfterBanForPastDays=1] Amount of days in which old messages will be deleted. (1-7)
 *
 * @property {Array<string>} [exemptPermissions=[]] Bypass users with at least one of these permissions
 * @property {boolean} [ignoreBots=true] Whether bot messages are ignored
 * @property {boolean} [verbose=false] Extended Logs from module (recommended)
 * 
 * @property {Array<string>|function} [ignoredUsers=[]] Array of string user IDs that are ignored
 * @property {Array<string>|function} [ignoredRoles=[]] Array of string role IDs or role name that are ignored
 * @property {Array<string>|function} [ignoredGuilds=[]] Array of string Guild IDs that are ignored
 * @property {Array<string>|function} [ignoredChannels=[]] Array of string channels IDs that are ignored
 * 
 * @property {boolean} [warnEnabled=true] If false, the bot won't warn users
 * @property {boolean} [kickEnabled=true] If false, the bot won't kick users
 * @property {boolean} [banEnabled=true] If false, the bot won't ban users
 * 
 */
const clientOptions = {
	warnThreshold: 3,
	kickThreshold: 5,
	banThreshold: 7,
	maxInterval: 2000,
	warnMessage: '{@user}, Please stop spamming.',
	kickMessage: '**{user_tag}** has been kicked for spamming.',
	banMessage: '**{user_tag}** has been banned for spamming.',
	maxDuplicatesWarning: 7,
	maxDuplicatesKick: 10,
	maxDuplicatesBan: 10,
	deleteMessagesAfterBanForPastDays: 1,
	exemptPermissions: [],
	ignoreBots: true,
	verbose: false,
	ignoredUsers: [],
	ignoredRoles: [],
	ignoredGuilds: [],
	ignoredChannels: [],
	warnEnabled: true,
	kickEnabled: true,
	banEnabled: true
};

/**
 * Cache data for the Anti Spam instance.
 * @typedef {object} AntiSpamData
 * 
 * @property {Array<object>} messageCache Array which contains the message cache
 * @property {Array<object>} users Array which contains the dates on which each user's message was sent 
 * 
 * @property {Array<Snowflake>} warnedUsers Array of warned users
 * @property {Array<Snowflake>} kickedUsers Array of kicked users
 * @property {Array<Snowflake>} bannedUsers Array of banned users
 * 
 */

/**
 * Anti Spam instance.
 * 
 * @param {AntiSpamOptions} [options] Client options.
 * 
 * @property {AntiSpamData} data Anti Spam cache data.
 * 
 * @example
 * const antiSpam = new AntiSpam({
 *   warnThreshold: 3, // Amount of messages sent in a row that will cause a warning.
 *   banThreshold: 7, // Amount of messages sent in a row that will cause a ban.
 *   maxInterval: 2000, // Amount of time (in ms) in which messages are cosidered spam.
 *   warnMessage: "{@user}, Please stop spamming.", // Message will be sent in chat upon warning.
 *   banMessage: "**{user_tag}** has been banned for spamming.", // Message will be sent in chat upon banning.
 *   maxDuplicatesWarning: 7, // Amount of same messages sent that will be considered as duplicates that will cause a warning.
 *   maxDuplicatesBan: 15, // Amount of same messages sent that will be considered as duplicates that will cause a ban.
 *   deleteMessagesAfterBanForPastDays: 1, // Amount of days in which old messages will be deleted. (1-7)
 *   exemptPermissions: ["MANAGE_MESSAGES", "ADMINISTRATOR", "MANAGE_GUILD", "BAN_MEMBERS"], // Bypass users with at least one of these permissions
 *   ignoreBots: true, // Ignore bot messages.
 *   verbose: false, // Extended Logs from module.
 *   ignoredUsers: [], // Array of string user IDs that are ignored.
 *   ignoredRoles: [], // Array of string role IDs or role name that are ignored.
 *   ignoredGuilds: [], // Array of string Guild IDs that are ignored.
 *   ignoredChannels: [] // Array of string channels IDs that are ignored.
 * });
 */
class AntiSpam extends EventEmitter {
	constructor(options = {}) {
		super();
		for (const key in clientOptions) {
			if (
				!options.hasOwnProperty(key) ||
				typeof options[key] === 'undefined' ||
				options[key] === null
			)
				options[key] = clientOptions[key];
		}
		this.options = options;
		this.data = {
			messageCache: [],
			bannedUsers: [],
			kickedUsers: [],
			warnedUsers: [],
			users: []
		};
	}

	/**
	 * Checks a message.
	 * 
	 * @param {Message} message The message to check.
	 * 
	 * @returns {boolean} Whether the message has triggered a threshold.
	 * 
	 * @example
	 * client.on('message', (msg) => {
	 * 	antiSpam.message(msg);
	 * });
	 */
	async message(message) {
		if (
			message.channel.type === 'dm' ||
			message.author.id === message.client.user.id ||
			message.guild.ownerID === message.author.id
		)
			return false;

		const { options, data } = this;
		if (!message.member) message.member = await message.guild.fetchMember(message.author);
		if (
			(options.ignoreBots && message.author.bot) ||
			options.exemptPermissions.some(permission => message.member.hasPermission(permission))
		)
			return false;

		if (
			message.member.roles.some(role =>
				typeof options.ignoredRoles === 'function'
					? options.ignoredRoles(role)
					: options.ignoredRoles.includes(role.id) || options.ignoredRoles.includes(role.name)
			) ||
			(typeof options.ignoredUsers === 'function'
				? options.ignoredUsers(message.author)
				: options.ignoredUsers.includes(message.author.id)) ||
			(typeof options.ignoredGuilds === 'function'
				? options.ignoredGuilds(message.guild)
				: options.ignoredGuilds.includes(message.guild.id)) ||
			(typeof options.ignoredChannels === 'function'
				? options.ignoredChannels(message.channel)
				: options.ignoredChannels.includes(message.channel.id))
		)
			return false;

		const banUser = async () => {
			data.messageCache = data.messageCache.filter(m => m.author !== message.author.id);
			data.bannedUsers.push(message.author.id);

			if (!message.member.bannable) {
				if (options.verbose)
					console.log(
						`**${message.author.tag}** (ID: ${message.author.id}) could not be banned, insufficient permissions.`
					);
				return false;
			}

			try {
				await message.member.ban({
					reason: 'Spamming!',
					days: options.deleteMessagesAfterBanForPastDays
				});
				if (options.banMessage)
					await message.channel.send(format(options.banMessage, message)).catch(e => {
						if (options.verbose) console.error(e);
					});
				this.emit('banAdd', message.member);
				return true;
			} catch (error) {
				const emitted = this.emit('error', message, error, 'ban');
				if (emitted) return false;
				if (options.verbose)
					console.log(
						`**${message.author.tag}** (ID: ${message.author.id}) could not be banned, ${error}.`
					);
				await message.channel
					.send(`Could not ban **${message.author.tag}** because of an error: \`${error}\`.`)
					.catch(e => {
						if (options.verbose) console.error(e);
					});
				return false;
			}
		};

		const kickUser = async () => {
			data.messageCache = data.messageCache.filter(m => m.author !== message.author.id);
			data.kickedUsers.push(message.author.id);

			if (!message.member.kickable) {
				if (options.verbose)
					console.log(
						`**${message.author.tag}** (ID: ${message.author.id}) could not be kicked, insufficient permissions.`
					);
				await msg.channel
					.send(
						`Could not kick **${msg.author.tag}** because of improper permissions.`
					)
					.catch((e) => {
						if (options.verbose) console.error(e);
					});
				return false;
			}

			try {
				await message.member.kick('Spamming!');
				if (options.kickMessage)
					await message.channel.send(format(options.kickMessage, message)).catch(e => {
						if (options.verbose) console.error(e);
					});
				this.emit('kickAdd', message.member);
				return true;
			} catch (error) {
				const emitted = this.emit('error', message, error, 'kick');
				if (emitted) return false;
				if (options.verbose)
					console.log(
						`**${message.author.tag}** (ID: ${message.author.id}) could not be kicked, ${error}.`
					);
				await message.channel
					.send(`Could not kick **${message.author.tag}** because of an error: \`${error}\`.`)
					.catch(e => {
						if (options.verbose) console.error(e);
					});
				return false;
			}
		};

		const warnUser = async () => {
			data.warnedUsers.push(message.author.id);
			this.emit('warnAdd', message.member);

			if (options.warnMessage)
				await message.channel.send(format(options.warnMessage, message)).catch(e => {
					if (options.verbose) console.error(e);
				});

			return true;
		};

		data.users.push({
			time: Date.now(),
			id: message.author.id
		});

		data.messageCache.push({
			content: message.content,
			author: message.author.id
		});

		const messageMatches = data.messageCache.filter(
			m => m.content === message.content && m.author === message.author.id
		).length;
		const spamMatches = data.users.filter(
			u => u.time > Date.now() - options.maxInterval && u.id === message.author.id
		).length;

		if (
			!data.warnedUsers.includes(message.author.id) &&
			(spamMatches === options.warnThreshold || messageMatches === options.maxDuplicatesWarning)
		) {
			if (options.warnEnabled) warnUser(message);
			this.emit(
				'spamThresholdWarn',
				message.member,
				messageMatches === options.maxDuplicatesWarning
			);
			return true;
		}

		if (
			!data.kickedUsers.includes(message.author.id) &&
			(spamMatches === options.kickThreshold || messageMatches === options.maxDuplicatesKick)
		) {
			if (options.kickEnabled) await kickUser(message);
			this.emit('spamThresholdKick', message.member, messageMatches === options.maxDuplicatesKick);
			return true;
		}

		if (spamMatches === options.banThreshold || messageMatches === options.maxDuplicatesBan) {
			if (options.banEnabled) await banUser(message);
			this.emit('spamThresholdBan', message.member, messageMatches === options.maxDuplicatesBan);
			return true;
		}

		return false;
	}

	/**
	 * Resets the cache data of the Anti Spam instance.
	 * @private
	 * 
	 * @returns {AntiSpamData} The cache that was just cleared.
	 * 
	 * @example
	 * antiSpam.resetData().then((data) => {
	 *   console.log("Cleared a total of "+data.messageCache+" cached messages.");
	 * });
	 */
	resetData() {
		let data = this.data;
		this.data.messageCache = [];
		this.data.bannedUsers = [];
		this.data.kickedUsers = [];
		this.data.warnedUsers = [];
		this.data.users = [];
		return data;
	}
}

/**
 * Emitted when a member is warned.
 * @event AntiSpam#warnAdd
 * 
 * @param {GuildMember} member The warned member.
 * 
 * @example
 * antiSpam.on("warnAdd", (member) => console.log(`${member.user.tag} has been warned.`));
 */

/**
 * Emitted when a member is kicked.
 * @event AntiSpam#kickAdd
 * 
 * @param {GuildMember} member The kicked member.
 * 
 * @example
 * antiSpam.on("kickAdd", (member) => console.log(`${member.user.tag} has been kicked.`));
 */

/**
 * Emitted when a member is banned.
 * @event AntiSpam#banAdd
 * 
 * @param {GuildMember} member The banned member.
 * 
 * @example
 * antiSpam.on("banAdd", (member) => console.log(`${member.user.tag} has been banned.`));
 */

/**
 * Emitted when a member reaches the warn threshold.
 * @event AntiSpam#spamThresholdWarn
 * 
 * @param {GuildMember} member The member who reached the warn threshold.
 * @param {boolean} duplicate Whether the member reached the warn threshold by spamming the same message.
 * 
 * @example
 * antiSpam.on("spamThresholdWarn", (member) => console.log(`${member.user.tag} has reached the warn threshold.`));
 */

/**
 * Emitted when a member reaches the kick threshold.
 * @event AntiSpam#spamThresholdKick
 * 
 * @param {GuildMember} member The member who reached the kick threshold.
 * @param {boolean} duplicate Whether the member reached the kick threshold by spamming the same message.
 * 
 * @example
 * antiSpam.on("spamThresholdKick", (member) => console.log(`${member.user.tag} has reached the kick threshold.`));
 */

/**
 * Emitted when a member reaches the ban threshold.
 * @event AntiSpam#spamThresholdBan
 * 
 * @param {GuildMember} member The member who reached the ban threshold.
 * @param {boolean} duplicate Whether the member reached the ban threshold by spamming the same message.
 * 
 * @example
 * antiSpam.on("spamThresholdBan", (member) => console.log(`${member.user.tag} has reached the ban threshold.`));
 */

module.exports = AntiSpam;

/**
 * This function formats a string by replacing some keywords with variables
 * @param {string|RichEmbed} string The non-formatted string or RichEmbed
 * @param {object} message The Discord Message object
 * @returns {string|RichEmbed} The formatted string
 */
function format(string, message) {
	if (typeof string === 'string')
		return string
			.replace(/{@user}/g, message.author.toString())
			.replace(/{user_tag}/g, message.author.tag)
			.replace(/{server_name}/g, message.guild.name);
	const embed = new RichEmbed(string);
	if (embed.description) embed.setDescription(format(embed.description, message));
	if (embed.title) embed.setTitle(format(embed.title, message));
	if (embed.footer && embed.footer.text) embed.footer.text = format(embed.footer.text, message);
	if (embed.author && embed.author.name) embed.author.name = format(embed.author.name, message);
	return embed;
}
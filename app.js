const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3002;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database tables
async function initializeDatabase() {
	try {
		// Create users table
		await pool.query(`
			CREATE TABLE IF NOT EXISTS users (
				username VARCHAR(255) PRIMARY KEY,
				password_salt VARCHAR(255) NOT NULL,
				password_hash VARCHAR(255) NOT NULL
			)
		`);

		// Create classes table
		await pool.query(`
			CREATE TABLE IF NOT EXISTS classes (
				id VARCHAR(255) PRIMARY KEY,
				username VARCHAR(255) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
				name VARCHAR(255) NOT NULL,
				bg_color VARCHAR(255) NOT NULL,
				text_color VARCHAR(255) NOT NULL,
				text_bg_color VARCHAR(255) NOT NULL,
				class_order INTEGER NOT NULL DEFAULT 0,
				UNIQUE(id)
			)
		`);

		// Create tasks table
		await pool.query(`
			CREATE TABLE IF NOT EXISTS tasks (
				id VARCHAR(255) PRIMARY KEY,
				class_id VARCHAR(255) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
				title VARCHAR(255) NOT NULL,
				deadline VARCHAR(255),
				description TEXT,
				task_order INTEGER NOT NULL DEFAULT 0,
				UNIQUE(id)
			)
		`);

		console.log('Database initialized successfully');
	} catch (err) {
		console.error('Error initializing database:', err);
	}
}

// Migration function to move old JSON data to PostgreSQL
async function migrateOldData() {
	try {
		const DATA_DIR = path.join(__dirname, 'data');
		const USERS_FILE = path.join(DATA_DIR, 'users.json');
		const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

		// Check if migration has already been done
		const existingUsers = await pool.query('SELECT COUNT(*) as count FROM users');
		if (existingUsers.rows[0].count > 0) {
			console.log('Migration already done, skipping...');
			return;
		}

		// Load old JSON files
		if (!fs.existsSync(USERS_FILE) || !fs.existsSync(CLASSES_FILE)) {
			console.log('No old data files found, skipping migration');
			return;
		}

		const oldUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
		const oldClasses = JSON.parse(fs.readFileSync(CLASSES_FILE, 'utf8'));

		// Migrate users
		for (const [username, userData] of Object.entries(oldUsers)) {
			await pool.query(
				'INSERT INTO users (username, password_salt, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
				[username, userData.salt, userData.hash]
			);
		}

		// Migrate classes and tasks
		for (const [username, userClassData] of Object.entries(oldClasses)) {
			for (let classOrder = 0; classOrder < userClassData.classes.length; classOrder++) {
				const classItem = userClassData.classes[classOrder];
				await pool.query(
					`INSERT INTO classes (id, username, name, bg_color, text_color, text_bg_color, class_order) 
					 VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
					[
						classItem.id,
						username,
						classItem.name,
						classItem.bgColor,
						classItem.textColor,
						classItem.textBgColor,
						classOrder
					]
				);

				// Migrate tasks
				for (let taskOrder = 0; taskOrder < classItem.tasks.length; taskOrder++) {
					const task = classItem.tasks[taskOrder];
					await pool.query(
						`INSERT INTO tasks (id, class_id, title, deadline, description, task_order) 
						 VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
						[
							task.id,
							classItem.id,
							task.title,
							task.deadline || '',
							task.description || '',
							taskOrder
						]
					);
				}
			}
		}

		console.log('Old data migrated successfully');
	} catch (err) {
		console.error('Error during migration:', err);
	}
}

// Database functions for users
async function loadUsers() {
	try {
		const result = await pool.query('SELECT username, password_salt, password_hash FROM users');
		const users = {};
		result.rows.forEach(row => {
			users[row.username] = { salt: row.password_salt, hash: row.password_hash };
		});
		return users;
	} catch (err) {
		console.error('Error loading users:', err);
		return {};
	}
}

async function saveUsers(users) {
	// This function is no longer needed since we save individually
	// Kept for compatibility
}

// Database functions for classes
async function loadUserClasses(username) {
	try {
		const classesResult = await pool.query(
			`SELECT id, name, bg_color, text_color, text_bg_color, class_order 
			 FROM classes 
			 WHERE username = $1 
			 ORDER BY class_order ASC, id ASC`,
			[username]
		);

		const classes = [];
		for (const classRow of classesResult.rows) {
			const tasksResult = await pool.query(
				`SELECT id, title, deadline, description 
				 FROM tasks 
				 WHERE class_id = $1 
				 ORDER BY task_order ASC, id ASC`,
				[classRow.id]
			);

			classes.push({
				id: classRow.id,
				name: classRow.name,
				bgColor: classRow.bg_color,
				textColor: classRow.text_color,
				textBgColor: classRow.text_bg_color,
				tasks: tasksResult.rows.map(row => ({
					id: row.id,
					title: row.title,
					deadline: row.deadline || '',
					description: row.description || ''
				}))
			});
		}

		return { classes };
	} catch (err) {
		console.error('Error loading user classes:', err);
		return { classes: [] };
	}
}

async function saveUserClasses(username, userData) {
	// This function is called to save changes, but with DB we save incrementally
	// Kept for compatibility
}

function createId() {
	return crypto.randomBytes(8).toString('hex');
}

// Encryption utilities for user token (AES-256-GCM)
const ENCRYPTION_KEY_ENV = process.env.ENCRYPTION_KEY || null; // base64 encoded 32 bytes
let ENCRYPTION_KEY;
if (ENCRYPTION_KEY_ENV) {
	try {
		ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_ENV, 'base64');
		if (ENCRYPTION_KEY.length !== 32) ENCRYPTION_KEY = null;
	} catch (e) {
		ENCRYPTION_KEY = null;
	}
}
if (!ENCRYPTION_KEY) {
	// Fallback: generate a key at startup (not persisted across restarts).
	// In production, set ENCRYPTION_KEY env var to a base64-encoded 32-byte key.
	ENCRYPTION_KEY = crypto.randomBytes(32);
	console.warn('Warning: using ephemeral encryption key. Set ENCRYPTION_KEY env var to persist tokens.');
}

function encryptUserToken(plaintext) {
	const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
	const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptUserToken(token) {
	try {
		const buf = Buffer.from(token, 'base64');
		const iv = buf.slice(0, 12);
		const tag = buf.slice(12, 28);
		const encrypted = buf.slice(28);
		const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
		decipher.setAuthTag(tag);
		const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
		return decrypted.toString('utf8');
	} catch (err) {
		return null;
	}
}

function formatCurrentDate(date) {
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	}).format(date);
}

function attachTaskStatuses(classes) {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return classes.map(classItem => ({
		...classItem,
		tasks: classItem.tasks.map(task => {
			if (!task.deadline) {
				return {
					...task,
					statusClass: 'deadline-none',
					displayDate: 'take your time'
				};
			}

			const deadlineDate = new Date(`${task.deadline}T00:00`);
			const diffDays = Math.round((deadlineDate - today) / 86400000);
			let statusClass = 'deadline-future';
			let displayDate = task.deadline;

			if (diffDays < 0) {
				statusClass = 'deadline-overdue';
				displayDate = `Overdue · ${task.deadline}`;
			} else if (diffDays === 0) {
				statusClass = 'deadline-soon';
				displayDate = 'Today';
			} else if (diffDays === 1) {
				statusClass = 'deadline-soon';
				displayDate = 'Tomorrow';
			} else if (diffDays === 2) {
				statusClass = 'deadline-overmorrow';
				displayDate = 'Overmorrow';
			} else {
				statusClass = 'deadline-future';
				displayDate = new Intl.DateTimeFormat('en-US', {
					month: 'short',
					day: 'numeric'
				}).format(deadlineDate);
			}

			return {
				...task,
				statusClass,
				displayDate
			};
		})
	}));
}

function hashPassword(password, salt) {
	const derived = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');
	return derived.toString('hex');
}

async function createUser(username, password) {
	try {
		// Check if username already exists by querying the database directly
		const existingUser = await pool.query(
			'SELECT username FROM users WHERE username = $1',
			[username]
		);
		
		if (existingUser.rows.length > 0) {
			return false; // User already exists
		}
		
		const salt = crypto.randomBytes(16).toString('hex');
		const hash = hashPassword(password, salt);
		await pool.query(
			'INSERT INTO users (username, password_salt, password_hash) VALUES ($1, $2, $3)',
			[username, salt, hash]
		);
		return true;
	} catch (err) {
		console.error('Error creating user:', err);
		throw err; // Re-throw the error so we can see what's happening
	}
}

async function verifyUser(username, password) {
	try {
		const result = await pool.query(
			'SELECT password_salt, password_hash FROM users WHERE username = $1',
			[username]
		);
		if (result.rows.length === 0) return false;
		const entry = result.rows[0];
		const hash = hashPassword(password, entry.password_salt);
		return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(entry.password_hash, 'hex'));
	} catch (err) {
		console.error('Error verifying user:', err);
		throw err; // Re-throw so caller can handle it
	}
}

app.get('/', (req, res) => {
	res.render('login', { error: null, username: '' });
});

app.get('/register', (req, res) => {
	res.render('register', { error: null, username: '' });
});

app.post('/register', async (req, res) => {
	const { username, password, confirm } = req.body;
	if (!username || !password) {
		return res.status(400).render('register', { error: 'Please provide a username and password.', username: username || '' });
	}
	if (password !== confirm) {
		return res.status(400).render('register', { error: 'Passwords do not match.', username });
	}
	try {
		const ok = await createUser(username, password);
		if (!ok) return res.status(400).render('register', { error: 'Username already taken.', username });
		const token = encryptUserToken(username);
		return res.redirect(`/dashboard?u=${encodeURIComponent(token)}`);
	} catch (err) {
		console.error('Registration error:', err);
		return res.status(500).render('register', { error: 'Database error. Please try again later.', username });
	}
});

app.post('/login', async (req, res) => {
	const { username, password } = req.body;
	if (!username || !password) {
		return res.status(400).render('login', { error: 'Please enter both username and password.', username: username || '' });
	}

	try {
		if (!await verifyUser(username, password)) {
			return res.status(401).render('login', { error: 'Invalid username or password.', username });
		}

		const token = encryptUserToken(username);
		return res.redirect(`/dashboard?u=${encodeURIComponent(token)}`);
	} catch (err) {
		console.error('Login error:', err);
		return res.status(500).render('login', { error: 'Database error. Please try again later.', username });
	}
});

app.get('/dashboard', async (req, res) => {
	const queryToken = req.query.u || null;
	if (!queryToken) {
		return res.redirect('/');
	}

	const user = decryptUserToken(queryToken);
	if (!user) {
		return res.redirect('/');
	}

	const token = queryToken;
	const error = req.query.error || null;
	const message = req.query.message || null;
	const userData = await loadUserClasses(user);
	const classes = attachTaskStatuses(userData.classes);
	res.render('dashboard', { user, token, currentDate: formatCurrentDate(new Date()), classes, error, message });
});

app.post('/dashboard/action', async (req, res) => {
	const { u, action, classId, taskId, className, bgColor, textColor, textBgColor, taskTitle, taskDeadline, taskDescription, currentPassword, newPassword, confirmPassword } = req.body;
	let user = null;
	let token = null;
	if (u) {
		user = decryptUserToken(u);
		token = u;
	}
	if (!user) return res.redirect('/');

	let redirectQuery = `u=${encodeURIComponent(token)}`;

	try {
		switch (action) {
			case 'createClass': {
				const newClassId = createId();
				await pool.query(
					`INSERT INTO classes (id, username, name, bg_color, text_color, text_bg_color, class_order)
					 VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(class_order), 0) + 1 FROM classes WHERE username = $2))`,
					[newClassId, user, (className || 'New class').trim() || 'New class', bgColor || '#ff9898', textColor || '#3d1f0f', textBgColor || '#ffffff']
				);
				break;
			}
			case 'updateClass': {
				await pool.query(
					`UPDATE classes SET name = $1, bg_color = $2, text_color = $3, text_bg_color = $4
					 WHERE id = $5 AND username = $6`,
					[(className || 'New class').trim() || 'New class', bgColor || '#ff9898', textColor || '#3d1f0f', textBgColor || '#ffffff', classId, user]
				);
				break;
			}
			case 'addTask': {
				if (taskTitle) {
					const newTaskId = createId();
					await pool.query(
						`INSERT INTO tasks (id, class_id, title, deadline, description, task_order)
						 VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(task_order), 0) + 1 FROM tasks WHERE class_id = $2))`,
						[newTaskId, classId, taskTitle.trim(), taskDeadline ? taskDeadline : '', (taskDescription || '').trim()]
					);
				}
				break;
			}
			case 'updateTask': {
				await pool.query(
					`UPDATE tasks SET title = $1, deadline = $2, description = $3
					 WHERE id = $4 AND class_id = $5`,
					[(taskTitle || '').trim() || 'Task', typeof taskDeadline === 'string' ? taskDeadline.trim() : '', typeof taskDescription === 'string' ? taskDescription.trim() : '', taskId, classId]
				);
				break;
			}
			case 'deleteTask': {
				await pool.query(
					'DELETE FROM tasks WHERE id = $1 AND class_id = $2',
					[taskId, classId]
				);
				break;
			}
			case 'deleteClass': {
				await pool.query(
					'DELETE FROM classes WHERE id = $1 AND username = $2',
					[classId, user]
				);
				break;
			}
			case 'reorderClasses': {
				try {
					const order = JSON.parse(req.body.classOrder || '[]');
					if (Array.isArray(order) && order.length) {
						for (let i = 0; i < order.length; i++) {
							await pool.query(
								'UPDATE classes SET class_order = $1 WHERE id = $2 AND username = $3',
								[i, order[i], user]
							);
						}
					}
				} catch (err) {
					// ignore malformed input
				}
				break;
			}
			case 'changePassword': {
				if (!currentPassword || !newPassword || !confirmPassword) {
					redirectQuery += `&error=${encodeURIComponent('Please fill in all password fields.')}`;
					return res.redirect(`/dashboard?${redirectQuery}`);
				}

				if (newPassword !== confirmPassword) {
					redirectQuery += `&error=${encodeURIComponent('New passwords do not match.')}`;
					return res.redirect(`/dashboard?${redirectQuery}`);
				}

				if (!await verifyUser(user, currentPassword)) {
					redirectQuery += `&error=${encodeURIComponent('Current password is incorrect.')}`;
					return res.redirect(`/dashboard?${redirectQuery}`);
				}

				const salt = crypto.randomBytes(16).toString('hex');
				const hash = hashPassword(newPassword, salt);
				await pool.query(
					'UPDATE users SET password_salt = $1, password_hash = $2 WHERE username = $3',
					[salt, hash, user]
				);
				redirectQuery += `&message=${encodeURIComponent('Password updated successfully.')}`;
				return res.redirect(`/dashboard?${redirectQuery}`);
			}
		}
	} catch (err) {
		console.error('Error in dashboard action:', err);
		redirectQuery += `&error=${encodeURIComponent('An error occurred. Please try again.')}`;
	}

	res.redirect(`/dashboard?${redirectQuery}`);
});

app.listen(port, async () => {
	await initializeDatabase();
	await migrateOldData();
	console.log(`WhatNow app listening on http://localhost:${port}`);
});


const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3002;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function loadUsers() {
	try {
		if (!fs.existsSync(USERS_FILE)) return {};
		const raw = fs.readFileSync(USERS_FILE, 'utf8');
		return JSON.parse(raw || '{}');
	} catch (err) {
		return {};
	}
}

function saveUsers(users) {
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

function loadClassesData() {
	try {
		if (!fs.existsSync(CLASSES_FILE)) return {};
		const raw = fs.readFileSync(CLASSES_FILE, 'utf8');
		return JSON.parse(raw || '{}');
	} catch (err) {
		return {};
	}
}

function saveClassesData(data) {
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(CLASSES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadUserClasses(username) {
	const all = loadClassesData();
	return all[username] || { classes: [] };
}

function saveUserClasses(username, userData) {
	const all = loadClassesData();
	all[username] = userData;
	saveClassesData(all);
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

function createUser(username, password) {
	const users = loadUsers();
	if (users[username]) return false; // already exists
	const salt = crypto.randomBytes(16).toString('hex');
	const hash = hashPassword(password, salt);
	users[username] = { salt, hash };
	saveUsers(users);
	return true;
}

function verifyUser(username, password) {
	const users = loadUsers();
	const entry = users[username];
	if (!entry) return false;
	const hash = hashPassword(password, entry.salt);
	return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(entry.hash, 'hex'));
}

app.get('/', (req, res) => {
	res.render('login', { error: null, username: '' });
});

app.get('/register', (req, res) => {
	res.render('register', { error: null, username: '' });
});

app.post('/register', (req, res) => {
	const { username, password, confirm } = req.body;
	if (!username || !password) {
		return res.status(400).render('register', { error: 'Please provide a username and password.', username: username || '' });
	}
	if (password !== confirm) {
		return res.status(400).render('register', { error: 'Passwords do not match.', username });
	}
	const ok = createUser(username, password);
	if (!ok) return res.status(400).render('register', { error: 'Username already taken.', username });
	const token = encryptUserToken(username);
	return res.redirect(`/dashboard?u=${encodeURIComponent(token)}`);
});

app.post('/login', (req, res) => {
	const { username, password } = req.body;
	if (!username || !password) {
		return res.status(400).render('login', { error: 'Please enter both username and password.', username: username || '' });
	}

	if (!verifyUser(username, password)) {
		return res.status(401).render('login', { error: 'Invalid username or password.', username });
	}

	const token = encryptUserToken(username);
	return res.redirect(`/dashboard?u=${encodeURIComponent(token)}`);
});

app.get('/dashboard', (req, res) => {
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
	const userData = loadUserClasses(user);
	const classes = attachTaskStatuses(userData.classes);
	res.render('dashboard', { user, token, currentDate: formatCurrentDate(new Date()), classes, error, message });
});

app.post('/dashboard/action', (req, res) => {
	const { u, action, classId, taskId, className, bgColor, textColor, textBgColor, taskTitle, taskDeadline, taskDescription, currentPassword, newPassword, confirmPassword } = req.body;
	let user = null;
	let token = null;
	if (u) {
		user = decryptUserToken(u);
		token = u;
	}
	if (!user) return res.redirect('/');

	const userData = loadUserClasses(user);
	let redirectQuery = `u=${encodeURIComponent(token)}`;

	switch (action) {
		case 'createClass': {
			userData.classes.unshift({
				id: createId(),
				name: (className || 'New class').trim() || 'New class',
				bgColor: bgColor || '#ff9898',
				textColor: textColor || '#3d1f0f',
				textBgColor: textBgColor || '#ffffff',
				tasks: []
			});
			break;
		}
		case 'updateClass': {
			const classItem = userData.classes.find((entry) => entry.id === classId);
			if (classItem) {
				classItem.name = (className || classItem.name).trim() || classItem.name;
				classItem.bgColor = bgColor || classItem.bgColor;
				classItem.textColor = textColor || classItem.textColor;
				classItem.textBgColor = textBgColor || classItem.textBgColor;
			}
			break;
		}
		case 'addTask': {
			const classItem = userData.classes.find((entry) => entry.id === classId);
			if (classItem && taskTitle) {
				classItem.tasks.unshift({
					id: createId(),
					title: taskTitle.trim(),
					deadline: taskDeadline ? taskDeadline : '',
					description: (taskDescription || '').trim()
				});
			}
			break;
		}
		case 'updateTask': {
			const classItem = userData.classes.find((entry) => entry.id === classId);
			if (classItem) {
				const task = classItem.tasks.find((entry) => entry.id === taskId);
				if (task) {
					task.title = (taskTitle || task.title).trim() || task.title;
					task.deadline = typeof taskDeadline === 'string' ? taskDeadline.trim() : task.deadline;
					task.description = (typeof taskDescription === 'string' ? taskDescription.trim() : task.description || '');
				}
			}
			break;
		}
		case 'deleteTask': {
			const classItem = userData.classes.find((entry) => entry.id === classId);
			if (classItem) {
				classItem.tasks = classItem.tasks.filter((entry) => entry.id !== taskId);
			}
			break;
		}
		case 'deleteClass': {
			userData.classes = userData.classes.filter((entry) => entry.id !== classId);
			break;
		}
		case 'reorderClasses': {
			try {
				const order = JSON.parse(req.body.classOrder || '[]');
				if (Array.isArray(order) && order.length) {
					const idToClass = Object.fromEntries(userData.classes.map(c => [c.id, c]));
					userData.classes = order.map(id => idToClass[id]).filter(Boolean);
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

			if (!verifyUser(user, currentPassword)) {
				redirectQuery += `&error=${encodeURIComponent('Current password is incorrect.')}`;
				return res.redirect(`/dashboard?${redirectQuery}`);
			}

			const users = loadUsers();
			const salt = crypto.randomBytes(16).toString('hex');
			users[user] = { salt, hash: hashPassword(newPassword, salt) };
			saveUsers(users);
			redirectQuery += `&message=${encodeURIComponent('Password updated successfully.')}`;
			return res.redirect(`/dashboard?${redirectQuery}`);
		}
	}

	saveUserClasses(user, userData);
	res.redirect(`/dashboard?${redirectQuery}`);
});

app.listen(port, () => {
	console.log(`WhatNow app listening on http://localhost:${port}`);
});


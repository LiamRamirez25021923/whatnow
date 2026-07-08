const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3002;

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'temporary-dev-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    console.log(
      `[REQUEST] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`
    );
  });

  next();
});

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

function formatDeadline(deadline) {
  if (!deadline) return '';

  if (deadline instanceof Date) {
    return deadline.toISOString().slice(0, 10);
  }

  return String(deadline).slice(0, 10);
}

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/');
  }

  next();
}

function loginAndRedirect(req, res, user) {
  req.session.regenerate((err) => {
    if (err) {
      console.error('[SESSION ERROR]', err);
      return res.status(500).send('Could not start a login session. Please try again.');
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    return res.redirect('/dashboard');
  });
}

async function createUser(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

  try {
    await pool.query(
      `INSERT INTO users (username, password_salt, password_hash)
       VALUES ($1, $2, $3)`,
      [username, salt, hash]
    );

    return true;
  } catch (err) {
    if (err.code === '23505') {
      return false;
    }

    throw err;
  }
}

async function verifyUser(username, password) {
  const result = await pool.query(
    `SELECT id, username, password_salt, password_hash
     FROM users
     WHERE username = $1`,
    [username]
  );

  const user = result.rows[0];

  if (!user) {
    return null;
  }

  const attemptedHash = hashPassword(password, user.password_salt);

  const storedHashBuffer = Buffer.from(user.password_hash, 'hex');
  const attemptedHashBuffer = Buffer.from(attemptedHash, 'hex');

  if (
    storedHashBuffer.length !== attemptedHashBuffer.length ||
    !crypto.timingSafeEqual(storedHashBuffer, attemptedHashBuffer)
  ) {
    return null;
  }

  return {
    id: user.id,
    username: user.username
  };
}

async function changeUserPassword(userId, currentPassword, newPassword) {
  const result = await pool.query(
    `SELECT id, password_salt, password_hash
     FROM users
     WHERE id = $1`,
    [userId]
  );

  const user = result.rows[0];

  if (!user) {
    return false;
  }

  const attemptedHash = hashPassword(currentPassword, user.password_salt);

  const storedHashBuffer = Buffer.from(user.password_hash, 'hex');
  const attemptedHashBuffer = Buffer.from(attemptedHash, 'hex');

  const currentPasswordIsCorrect =
    storedHashBuffer.length === attemptedHashBuffer.length &&
    crypto.timingSafeEqual(storedHashBuffer, attemptedHashBuffer);

  if (!currentPasswordIsCorrect) {
    return false;
  }

  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);

  await pool.query(
    `UPDATE users
     SET password_salt = $1,
         password_hash = $2
     WHERE id = $3`,
    [newSalt, newHash, userId]
  );

  return true;
}

async function loadUserClasses(userId) {
  const classesResult = await pool.query(
    `SELECT id, name, bg_color, text_color, text_bg_color
     FROM classes
     WHERE user_id = $1
     ORDER BY sort_order ASC, created_at DESC`,
    [userId]
  );

  const classes = [];

  for (const classRow of classesResult.rows) {
    const tasksResult = await pool.query(
      `SELECT id, title, deadline, description
       FROM tasks
       WHERE class_id = $1
       ORDER BY sort_order ASC, created_at DESC`,
      [classRow.id]
    );

    classes.push({
      id: classRow.id,
      name: classRow.name,
      bgColor: classRow.bg_color,
      textColor: classRow.text_color,
      textBgColor: classRow.text_bg_color,
      tasks: tasksResult.rows.map(task => ({
        id: task.id,
        title: task.title,
        deadline: formatDeadline(task.deadline),
        description: task.description || ''
      }))
    });
  }

  return classes;
}

app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS server_time');

    res.json({
      ok: true,
      message: 'Database connection works',
      serverTime: result.rows[0].server_time
    });
  } catch (err) {
    console.error('[DB HEALTH ERROR]', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      stack: err.stack
    });

    res.status(500).json({
      ok: false,
      message: err.message,
      code: err.code
    });
  }
});

app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }

  res.render('login', {
    error: null,
    username: ''
  });
});

app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }

  res.render('login', {
    error: null,
    username: ''
  });
});

app.get('/register', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }

  res.render('register', {
    error: null,
    username: ''
  });
});

app.post('/register', async (req, res) => {
  try {
    const { username, password, confirm } = req.body;
    const cleanUsername = username ? username.trim() : '';

    if (!cleanUsername || !password) {
      return res.status(400).render('register', {
        error: 'Please provide a username and password.',
        username: cleanUsername
      });
    }

    if (password !== confirm) {
      return res.status(400).render('register', {
        error: 'Passwords do not match.',
        username: cleanUsername
      });
    }

    const created = await createUser(cleanUsername, password);

    if (!created) {
      return res.status(400).render('register', {
        error: 'Username already taken.',
        username: cleanUsername
      });
    }

    const user = await verifyUser(cleanUsername, password);
    return loginAndRedirect(req, res, user);
  } catch (err) {
    console.error('[REGISTER ERROR]', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      stack: err.stack
    });

    return res.status(500).send('Internal Server Error');
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const cleanUsername = username ? username.trim() : '';

    if (!cleanUsername || !password) {
      return res.status(400).render('login', {
        error: 'Please enter both username and password.',
        username: cleanUsername
      });
    }

    const user = await verifyUser(cleanUsername, password);

    if (!user) {
      return res.status(401).render('login', {
        error: 'Invalid username or password.',
        username: cleanUsername
      });
    }

    return loginAndRedirect(req, res, user);
  } catch (err) {
    console.error('[LOGIN ERROR]', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      stack: err.stack
    });

    return res.status(500).send('Internal Server Error');
  }
});

app.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const error = req.query.error || null;
    const message = req.query.message || null;

    const rawClasses = await loadUserClasses(req.session.userId);
    const classes = attachTaskStatuses(rawClasses);

    res.render('dashboard', {
      user: req.session.username,
      token: '',
      currentDate: formatCurrentDate(new Date()),
      classes,
      error,
      message
    });
  } catch (err) {
    console.error('[DASHBOARD ERROR]', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      stack: err.stack
    });

    res.status(500).send('Could not load dashboard.');
  }
});

app.post('/dashboard/action', requireLogin, async (req, res) => {
  try {
    const {
      action,
      classId,
      taskId,
      className,
      bgColor,
      textColor,
      textBgColor,
      taskTitle,
      taskDeadline,
      taskDescription,
      currentPassword,
      newPassword,
      confirmPassword
    } = req.body;

    const userId = req.session.userId;

    switch (action) {
      case 'createClass': {
        await pool.query(
          `INSERT INTO classes
           (user_id, name, bg_color, text_color, text_bg_color)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            (className || 'New class').trim() || 'New class',
            bgColor || '#ff9898',
            textColor || '#3d1f0f',
            textBgColor || '#ffffff'
          ]
        );

        break;
      }

      case 'updateClass': {
        await pool.query(
          `UPDATE classes
           SET name = $1,
               bg_color = $2,
               text_color = $3,
               text_bg_color = $4
           WHERE id = $5
           AND user_id = $6`,
          [
            (className || 'Untitled class').trim() || 'Untitled class',
            bgColor || '#ff9898',
            textColor || '#3d1f0f',
            textBgColor || '#ffffff',
            classId,
            userId
          ]
        );

        break;
      }

      case 'deleteClass': {
        await pool.query(
          `DELETE FROM classes
           WHERE id = $1
           AND user_id = $2`,
          [classId, userId]
        );

        break;
      }

      case 'addTask': {
        if (taskTitle && taskTitle.trim()) {
          await pool.query(
            `INSERT INTO tasks
             (class_id, title, deadline, description)
             SELECT $1, $2, $3, $4
             WHERE EXISTS (
               SELECT 1
               FROM classes
               WHERE id = $1
               AND user_id = $5
             )`,
            [
              classId,
              taskTitle.trim(),
              taskDeadline || null,
              (taskDescription || '').trim(),
              userId
            ]
          );
        }

        break;
      }

      case 'updateTask': {
        await pool.query(
          `UPDATE tasks
           SET title = $1,
               deadline = $2,
               description = $3
           WHERE id = $4
           AND class_id IN (
             SELECT id
             FROM classes
             WHERE user_id = $5
           )`,
          [
            (taskTitle || 'Untitled task').trim() || 'Untitled task',
            taskDeadline || null,
            (taskDescription || '').trim(),
            taskId,
            userId
          ]
        );

        break;
      }

      case 'deleteTask': {
        await pool.query(
          `DELETE FROM tasks
           WHERE id = $1
           AND class_id IN (
             SELECT id
             FROM classes
             WHERE user_id = $2
           )`,
          [taskId, userId]
        );

        break;
      }

      case 'reorderClasses': {
        try {
          const order = JSON.parse(req.body.classOrder || '[]');

          if (Array.isArray(order)) {
            for (let i = 0; i < order.length; i++) {
              await pool.query(
                `UPDATE classes
                 SET sort_order = $1
                 WHERE id = $2
                 AND user_id = $3`,
                [i, order[i], userId]
              );
            }
          }
        } catch (err) {
          console.error('[REORDER ERROR]', err.message);
        }

        break;
      }

      case 'changePassword': {
        if (!currentPassword || !newPassword || !confirmPassword) {
          return res.redirect(`/dashboard?error=${encodeURIComponent('Please fill in all password fields.')}`);
        }

        if (newPassword !== confirmPassword) {
          return res.redirect(`/dashboard?error=${encodeURIComponent('New passwords do not match.')}`);
        }

        const changed = await changeUserPassword(userId, currentPassword, newPassword);

        if (!changed) {
          return res.redirect(`/dashboard?error=${encodeURIComponent('Current password is incorrect.')}`);
        }

        return res.redirect(`/dashboard?message=${encodeURIComponent('Password updated successfully.')}`);
      }

      default:
        break;
    }

    return res.redirect('/dashboard');
  } catch (err) {
    console.error('[DASHBOARD ACTION ERROR]', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      stack: err.stack
    });

    return res.status(500).send('Something went wrong while updating your dashboard.');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    code: err.code,
    stack: err.stack
  });

  res.status(500).send('Internal Server Error - check Render logs');
});

app.listen(port, () => {
  console.log(`WhatNow app listening on port ${port}`);
});
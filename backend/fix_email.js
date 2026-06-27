const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Replace sender/mailto usages of process.env.SMTP_USER with process.env.EMAIL_FROM
content = content.replace(/<\$\{process\.env\.SMTP_USER\}>/g, '<${process.env.EMAIL_FROM || \'zeetechnologies.pk@gmail.com\'}>');
content = content.replace(/mailto:\$\{process\.env\.SMTP_USER\}/g, 'mailto:${process.env.EMAIL_FROM || \'zeetechnologies.pk@gmail.com\'}');
content = content.replace(/>\$\{process\.env\.SMTP_USER\}<\/a>/g, '>${process.env.EMAIL_FROM || \'zeetechnologies.pk@gmail.com\'}</a>');

// For the Contact Us replyTo/to and default emails
content = content.replace(/to:\s*process\.env\.SMTP_USER/g, 'to: process.env.EMAIL_FROM || \'zeetechnologies.pk@gmail.com\'');
content = content.replace(/defaultEmail = process\.env\.SMTP_USER \|\| process\.env\.SMTP_USER/g, 'defaultEmail = process.env.EMAIL_FROM || \'zeetechnologies.pk@gmail.com\'');
content = content.replace(/default: process\.env\.SMTP_USER/g, 'default: \'zeetechnologies.pk@gmail.com\'');

// Clean up the fallback in auth
content = content.replace(/user: process\.env\.SMTP_USER \|\| process\.env\.SMTP_USER/g, 'user: process.env.SMTP_USER');

fs.writeFileSync('server.js', content);
console.log('Fixed successfully');

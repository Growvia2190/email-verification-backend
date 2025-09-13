const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Disposable domains database (expanded)
const disposableDomains = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'guerrillamail.com',
  'guerrillamail.net', 'guerrillamail.biz', 'guerrillamail.org', 'sharklasers.com',
  'grr.la', 'mailinator.com', 'mailinator.net', 'mailinator2.com', 'tempmail.org',
  'temp-mail.org', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'throwaway.email',
  'maildrop.cc', 'mailnesia.com', 'mohmal.com', 'trashmail.com', 'trashmail.net',
  'spamgourmet.com', 'getnada.com', 'mytrashmail.com', 'anonymbox.com',
  'hidemail.de', 'kasmail.com', 'nobulk.com', 'nowmymail.com', 'objectmail.com',
  'boun.cr', 'deadaddress.com', 'despammed.com', 'dontsendmespam.de',
  'emailias.com', 'lifebyfood.com', 'lookugly.com', 'mintemail.com',
  'sogetthis.com', 'spamhereis.com', 'spamhole.com', 'spamify.com', 'spaml.com',
  'spamthis.co.uk', 'spamthisplease.com', 'suremail.info', 'tempalias.com',
  'temporary-email.net', 'veryrealemail.com', 'zumpul.com', 'dispostable.com',
  'fakemail.fr', 'getonemail.com', 'harakirimail.com', 'inbox.si',
  'mailcatch.com', 'maileater.com', 'mailexpire.com', 'mailforspam.com',
  'mailimate.com', 'mailme.lv', 'mailmetrash.com', 'mailzilla.com'
]);

// Role-based prefixes
const roleBasedPrefixes = new Set([
  'admin', 'administrator', 'info', 'contact', 'support', 'sales', 'marketing',
  'hr', 'help', 'service', 'office', 'team', 'group', 'mail', 'email',
  'webmaster', 'postmaster', 'noreply', 'no-reply', 'donotreply',
  'do-not-reply', 'notifications', 'notification', 'alerts', 'automatic',
  'robot', 'system', 'daemon', 'manager', 'director', 'president'
]);

// Email validation functions
const validateEmailSyntax = (email) => {
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return regex.test(email) && email.length <= 320;
};

const isDisposableEmail = (email) => {
  const domain = email.split('@')[1]?.toLowerCase();
  return disposableDomains.has(domain);
};

const isRoleBasedEmail = (email) => {
  const prefix = email.split('@')[0]?.toLowerCase();
  return roleBasedPrefixes.has(prefix) || 
         [...roleBasedPrefixes].some(role => 
           prefix.startsWith(role + '.') || 
           prefix.startsWith(role + '_') || 
           prefix.startsWith(role + '-')
         );
};

const checkDomainTypos = (domain) => {
  const commonDomains = {
    'gmail.com': ['gmai.com', 'gmial.com', 'gmail.co', 'gmal.com', 'gmil.com'],
    'yahoo.com': ['yaho.com', 'yahoo.co', 'yahooo.com', 'yahoo.cm'],
    'hotmail.com': ['hotmai.com', 'hotmal.com', 'hotmial.com', 'hotmil.com'],
    'outlook.com': ['outlook.co', 'outlok.com', 'outloo.com'],
    'aol.com': ['aol.co', 'ao.com', 'alo.com']
  };

  for (const [correct, typos] of Object.entries(commonDomains)) {
    if (typos.includes(domain.toLowerCase())) {
      return { hasTypo: true, suggestion: correct };
    }
  }
  return { hasTypo: false };
};

// Main verification function
const verifyEmail = async (email) => {
  const trimmedEmail = email.trim().toLowerCase();
  
  if (!trimmedEmail) return null;

  const result = {
    email: trimmedEmail,
    timestamp: new Date().toISOString(),
    checks: {}
  };

  const [localPart, domain] = trimmedEmail.split('@');
  result.localPart = localPart;
  result.domain = domain;

  // Syntax validation
  result.checks.syntax = {
    valid: validateEmailSyntax(trimmedEmail),
    score: validateEmailSyntax(trimmedEmail) ? 25 : 0
  };

  if (!result.checks.syntax.valid) {
    result.status = 'invalid';
    result.reason = 'Invalid email syntax';
    result.score = 0;
    result.deliverable = 'no';
    return result;
  }

  // Disposable check
  result.checks.disposable = {
    isDisposable: isDisposableEmail(trimmedEmail),
    score: isDisposableEmail(trimmedEmail) ? -30 : 15
  };

  // Role-based check
  result.checks.roleBased = {
    isRoleBased: isRoleBasedEmail(trimmedEmail),
    score: isRoleBasedEmail(trimmedEmail) ? -15 : 10
  };

  // Typo check
  result.checks.typos = checkDomainTypos(domain);
  result.checks.typos.score = result.checks.typos.hasTypo ? -10 : 5;

  // Professional pattern check
  const professionalPatterns = [
    /^[a-z]+\.[a-z]+$/, // firstname.lastname
    /^[a-z]\.[a-z]+$/, // f.lastname
    /^[a-z]+[a-z]$/ // firstnamelastname
  ];
  
  const isProfessional = professionalPatterns.some(pattern => 
    pattern.test(localPart.toLowerCase())
  );
  
  result.checks.professional = {
    isProfessional,
    score: isProfessional ? 10 : 0
  };

  // Calculate total score
  const totalScore = Object.values(result.checks)
    .reduce((sum, check) => sum + (check.score || 0), 0);

  result.score = Math.max(0, Math.min(100, totalScore + 50)); // Base score of 50

  // Determine status
  if (result.checks.disposable?.isDisposable) {
    result.status = 'risky';
    result.reason = 'Disposable email provider';
    result.deliverable = 'risky';
  } else if (result.score >= 70) {
    result.status = 'valid';
    result.reason = 'Email appears valid and deliverable';
    result.deliverable = 'yes';
  } else if (result.score >= 40) {
    result.status = 'risky';
    result.reason = result.checks.roleBased?.isRoleBased ? 
      'Role-based email address' : 'Email deliverability uncertain';
    result.deliverable = 'risky';
  } else {
    result.status = 'invalid';
    result.reason = 'Email appears invalid or low quality';
    result.deliverable = 'no';
  }

  return result;
};

// API Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'Email Verification API'
  });
});

app.post('/verify', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await verifyEmail(email);
    res.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/verify-bulk', async (req, res) => {
  try {
    const { emails, options = {} } = req.body;
    
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Emails array is required' });
    }

    if (emails.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 emails per request' });
    }

    const results = [];
    const batchSize = Math.min(options.batchSize || 10, 20);
    const delay = Math.max(options.delay || 100, 50);

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map(email => verifyEmail(email));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));

      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const stats = {
      total: results.length,
      valid: results.filter(r => r.status === 'valid').length,
      invalid: results.filter(r => r.status === 'invalid').length,
      risky: results.filter(r => r.status === 'risky').length,
      avgScore: results.length > 0 ? 
        Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length) : 0
    };

    res.json({
      results,
      stats,
      processed: results.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Bulk verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/disposable-domains', (req, res) => {
  res.json({
    domains: Array.from(disposableDomains).sort(),
    count: disposableDomains.size
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Email verification server running on port ${PORT}`);
  console.log(`Disposable domains loaded: ${disposableDomains.size}`);
});

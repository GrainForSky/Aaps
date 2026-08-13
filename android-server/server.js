/**
 * AndroidAPS Remote Control - Android HTTP Server
 * 
 * 运行环境: Termux (Android)
 * 功能: 接收 Web 控制面板的 HTTP 请求，与 AndroidAPS 交互
 * 
 * 依赖:
 *   - Termux 已安装
 *   - Node.js 已安装 (pkg install nodejs)
 *   - AndroidAPS 已安装并运行
 *   - Termux:API 已安装 (pkg install termux-api)
 * 
 * 权限:
 *   - 需要授予 Termux 相关权限 (SMS, 通知等)
 *   - 如果 AndroidAPS 需要 root 权限来读取数据库，需要 root
 */

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  port: process.env.AAPS_PORT || 8080,
  token: process.env.AAPS_TOKEN || '',  // Bearer token for auth
  aapsPackage: 'info.nightscout.androidaps',
  // AndroidAPS 数据库路径 (需要 root)
  dbPath: '/data/data/info.nightscout.androidaps/databases/',
  // 是否使用 SMS 方式发送命令 (备选方案)
  useSMS: process.env.AAPS_USE_SMS === 'true',
  // SMS 命令发送到的号码 (本机号码)
  smsNumber: process.env.AAPS_SMS_NUMBER || '',
};

// ============================================================
// 认证中间件
// ============================================================
function authMiddleware(req, res, next) {
  if (!CONFIG.token) return next(); // 未配置 token 则跳过认证
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权: 缺少 Bearer token' });
  }
  
  const token = authHeader.substring(7);
  if (token !== CONFIG.token) {
    return res.status(403).json({ error: '未授权: token 无效' });
  }
  
  next();
}

app.use(authMiddleware);

// ============================================================
// 工具函数
// ============================================================

/**
 * 执行 Android shell 命令
 */
function execShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * 发送 Android 广播 (用于触发 AndroidAPS 操作)
 */
async function sendBroadcast(action, extras = {}) {
  let cmd = `am broadcast -a ${action} -p ${CONFIG.aapsPackage}`;
  for (const [key, value] of Object.entries(extras)) {
    if (typeof value === 'number') {
      cmd += ` --ef ${key} ${value}`;
    } else {
      cmd += ` --es ${key} "${value}"`;
    }
  }
  return execShell(cmd);
}

/**
 * 发送 SMS 命令到 AndroidAPS (备选方案)
 * AndroidAPS SMS Communicator 支持的命令格式:
 *   BOLUS <units>
 *   CARBS <grams>
 *   SMS COMMAND <command>
 */
async function sendSMSCommand(command) {
  if (!CONFIG.smsNumber) {
    throw new Error('未配置 SMS 号码，请在环境变量 AAPS_SMS_NUMBER 中设置');
  }
  // 使用 termux-sms-send 发送 SMS
  const cmd = `termux-sms-send -n ${CONFIG.smsNumber} "${command}"`;
  return execShell(cmd);
}

/**
 * 通过 Android content provider 查询数据
 */
async function queryContent(uri, projection = null, selection = null) {
  let cmd = `content query --uri "${uri}"`;
  if (projection) cmd += ` --projection "${projection}"`;
  if (selection) cmd += ` --where "${selection}"`;
  return execShell(cmd);
}

/**
 * 通过 SQLite 直接查询 AndroidAPS 数据库 (需要 root)
 */
async function querySQLite(dbName, sql) {
  const dbFile = `${CONFIG.dbPath}${dbName}`;
  const cmd = `su -c "sqlite3 -json ${dbFile} '${sql}'"`;
  return execShell(cmd);
}

// ============================================================
// API 端点
// ============================================================

/**
 * GET /ping - 健康检查
 */
app.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AndroidAPS Remote Server',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

/**
 * POST /bolus - 输注胰岛素
 * Body: { insulin: number }
 */
app.post('/bolus', async (req, res) => {
  try {
    const { insulin } = req.body;
    if (!insulin || insulin <= 0) {
      return res.status(400).json({ error: '无效的胰岛素剂量' });
    }

    console.log(`[BOLUS] 输注 ${insulin}U 胰岛素`);

    // 方法 1: 发送广播 (如果 AndroidAPS 配置了接收广播)
    try {
      await sendBroadcast('info.nightscout.androidaps.action.BOLUS', { insulin });
      return res.json({ success: true, message: `已发送 bolus 命令: ${insulin}U`, method: 'broadcast' });
    } catch (e) {
      console.log('[BOLUS] 广播方式失败，尝试 SMS 方式');
    }

    // 方法 2: SMS 方式
    if (CONFIG.useSMS || true) {
      try {
        await sendSMSCommand(`BOLUS ${insulin}`);
        return res.json({ success: true, message: `已通过 SMS 发送 bolus 命令: ${insulin}U`, method: 'sms' });
      } catch (e) {
        console.log('[BOLUS] SMS 方式失败:', e.message);
      }
    }

    // 方法 3: 使用 am startservice
    try {
      const cmd = `am startservice -a info.nightscout.androidaps.action.BOLUS --ef insulin ${insulin} -n ${CONFIG.aapsPackage}/.services.CommunicationService`;
      await execShell(cmd);
      return res.json({ success: true, message: `已通过 service 发送 bolus 命令: ${insulin}U`, method: 'service' });
    } catch (e) {
      console.log('[BOLUS] Service 方式失败:', e.message);
    }

    res.status(500).json({ error: '所有命令发送方式均失败，请检查 AndroidAPS 配置' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /carbs - 记录碳水
 * Body: { carbs: number }
 */
app.post('/carbs', async (req, res) => {
  try {
    const { carbs } = req.body;
    if (!carbs || carbs <= 0) {
      return res.status(400).json({ error: '无效的碳水剂量' });
    }

    console.log(`[CARBS] 记录 ${carbs}g 碳水`);

    // 方法 1: 广播
    try {
      await sendBroadcast('info.nightscout.androidaps.action.CARBS', { carbs });
      return res.json({ success: true, message: `已发送 carbs 命令: ${carbs}g`, method: 'broadcast' });
    } catch (e) {
      console.log('[CARBS] 广播方式失败，尝试 SMS 方式');
    }

    // 方法 2: SMS
    if (CONFIG.useSMS || true) {
      try {
        await sendSMSCommand(`CARBS ${carbs}`);
        return res.json({ success: true, message: `已通过 SMS 发送 carbs 命令: ${carbs}g`, method: 'sms' });
      } catch (e) {
        console.log('[CARBS] SMS 方式失败:', e.message);
      }
    }

    // 方法 3: Service
    try {
      const cmd = `am startservice -a info.nightscout.androidaps.action.CARBS --ef carbs ${carbs} -n ${CONFIG.aapsPackage}/.services.CommunicationService`;
      await execShell(cmd);
      return res.json({ success: true, message: `已通过 service 发送 carbs 命令: ${carbs}g`, method: 'service' });
    } catch (e) {
      console.log('[CARBS] Service 方式失败:', e.message);
    }

    res.status(500).json({ error: '所有命令发送方式均失败' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /treatment - 混合输注 (胰岛素 + 碳水)
 * Body: { insulin?: number, carbs?: number, notes?: string }
 */
app.post('/treatment', async (req, res) => {
  try {
    const { insulin, carbs, notes } = req.body;

    if ((!insulin || insulin <= 0) && (!carbs || carbs <= 0)) {
      return res.status(400).json({ error: '至少需要指定胰岛素或碳水剂量' });
    }

    console.log(`[TREATMENT] 混合输注: insulin=${insulin}U, carbs=${carbs}g`);

    const results = [];

    // 发送胰岛素命令
    if (insulin && insulin > 0) {
      try {
        if (CONFIG.useSMS) {
          await sendSMSCommand(`BOLUS ${insulin}`);
          results.push({ type: 'insulin', status: 'sent', method: 'sms' });
        } else {
          await sendBroadcast('info.nightscout.androidaps.action.BOLUS', { insulin });
          results.push({ type: 'insulin', status: 'sent', method: 'broadcast' });
        }
      } catch (e) {
        try {
          await sendSMSCommand(`BOLUS ${insulin}`);
          results.push({ type: 'insulin', status: 'sent', method: 'sms-fallback' });
        } catch (e2) {
          results.push({ type: 'insulin', status: 'failed', error: e2.message });
        }
      }
    }

    // 发送碳水命令
    if (carbs && carbs > 0) {
      try {
        if (CONFIG.useSMS) {
          await sendSMSCommand(`CARBS ${carbs}`);
          results.push({ type: 'carbs', status: 'sent', method: 'sms' });
        } else {
          await sendBroadcast('info.nightscout.androidaps.action.CARBS', { carbs });
          results.push({ type: 'carbs', status: 'sent', method: 'broadcast' });
        }
      } catch (e) {
        try {
          await sendSMSCommand(`CARBS ${carbs}`);
          results.push({ type: 'carbs', status: 'sent', method: 'sms-fallback' });
        } catch (e2) {
          results.push({ type: 'carbs', status: 'failed', error: e2.message });
        }
      }
    }

    const allSuccess = results.every(r => r.status === 'sent');
    res.json({
      success: allSuccess,
      results,
      notes: notes || '',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /status - 获取设备/泵状态
 */
app.get('/status', async (req, res) => {
  try {
    const status = {
      pump: {},
      openaps: {},
      timestamp: new Date().toISOString(),
    };

    // 尝试从 AndroidAPS 数据库读取泵状态
    try {
      const result = await querySQLite('androidaps.db', 
        'SELECT * FROM PumpStatus ORDER BY timestamp DESC LIMIT 1');
      if (result) {
        const data = JSON.parse(result);
        if (data.length > 0) {
          status.pump = {
            reservoir: data[0].reservoir || data[0].baseBasalRate,
            battery: { percent: data[0].batteryPercent },
            status: {
              status: data[0].status || 'normal',
              bolusing: data[0].bolusing || false,
              suspended: data[0].suspended || false,
            },
          };
        }
      }
    } catch (e) {
      console.log('[STATUS] 无法读取泵数据库:', e.message);
    }

    // 尝试读取 IOB
    try {
      const result = await querySQLite('androidaps.db',
        'SELECT * FROM Treatments WHERE insulin > 0 ORDER BY timestamp DESC LIMIT 10');
      if (result) {
        const treatments = JSON.parse(result);
        // 简单计算 IOB (实际应该用更精确的算法)
        const now = Date.now();
        let iob = 0;
        for (const t of treatments) {
          const age = (now - new Date(t.timestamp).getTime()) / 3600000; // hours
          if (age < 6 && t.insulin) {
            // 简化的胰岛素衰减模型 (Dia = 5h)
            const dia = 5;
            const remaining = Math.max(0, 1 - age / dia);
            iob += t.insulin * remaining;
          }
        }
        status.openaps.iob = { iob: Math.round(iob * 100) / 100 };
      }
    } catch (e) {
      console.log('[STATUS] 无法计算 IOB:', e.message);
    }

    // 尝试通过 content provider 获取状态
    try {
      const result = await queryContent(
        `content://${CONFIG.aapsPackage}.provider/status`
      );
      if (result && result.includes('Cursor')) {
        // 解析 content provider 返回的数据
        console.log('[STATUS] Content provider 返回:', result.substring(0, 200));
      }
    } catch (e) {
      console.log('[STATUS] Content provider 不可用:', e.message);
    }

    // 获取电池信息
    try {
      const batteryResult = await execShell('dumpsys battery');
      const levelMatch = batteryResult.match(/level:\s*(\d+)/);
      if (levelMatch) {
        status.pump.battery = { percent: parseInt(levelMatch[1]) };
      }
    } catch (e) {
      console.log('[STATUS] 无法获取电池信息');
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /cgm?count=12 - 获取 CGM 血糖数据
 */
app.get('/cgm', async (req, res) => {
  try {
    const count = parseInt(req.query.count || '12');
    const entries = [];

    // 尝试从 AndroidAPS 数据库读取 CGM 数据
    try {
      const result = await querySQLite('androidaps.db',
        `SELECT * FROM GlucoseValues ORDER BY timestamp DESC LIMIT ${count}`);
      if (result) {
        const data = JSON.parse(result);
        for (const row of data) {
          entries.push({
            _id: String(row._id || row.timestamp),
            sgv: row.value || row.sgv,
            direction: row.trend || row.direction || 'NONE',
            date: new Date(row.timestamp).getTime(),
            dateString: new Date(row.timestamp).toISOString(),
            type: 'sgv',
            device: 'AndroidAPS',
          });
        }
      }
    } catch (e) {
      console.log('[CGM] 无法读取 CGM 数据库:', e.message);
    }

    // 尝试从 xDrip 数据库读取 (如果用户使用 xDrip 作为 CGM 数据源)
    if (entries.length === 0) {
      try {
        const result = await querySQLite(
          '/data/data/com.eveningoutpost.dexdrip/databases/.dexdrip.db',
          `SELECT * FROM bgreadings ORDER BY timestamp DESC LIMIT ${count}`
        );
        if (result) {
          const data = JSON.parse(result);
          for (const row of data) {
            entries.push({
              _id: String(row._id || row.timestamp),
              sgv: Math.round(row.calculated_value || row.sgv),
              direction: row.slopeName || row.direction || 'NONE',
              date: row.timestamp,
              dateString: new Date(row.timestamp).toISOString(),
              type: 'sgv',
              device: 'xDrip',
            });
          }
        }
      } catch (e) {
        console.log('[CGM] 无法读取 xDrip 数据库:', e.message);
      }
    }

    // 尝试通过 content provider 读取
    if (entries.length === 0) {
      try {
        const result = await queryContent(
          'content://com.eveningoutpost.dexdrip.provider.entries',
          'calculated_value,timestamp,slopeName'
        );
        if (result) {
          console.log('[CGM] Content provider 返回:', result.substring(0, 200));
        }
      } catch (e) {
        console.log('[CGM] Content provider 不可用');
      }
    }

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /treatments?count=20 - 获取治疗历史
 */
app.get('/treatments', async (req, res) => {
  try {
    const count = parseInt(req.query.count || '20');
    const treatments = [];

    // 尝试从 AndroidAPS 数据库读取
    try {
      const result = await querySQLite('androidaps.db',
        `SELECT * FROM Treatments ORDER BY timestamp DESC LIMIT ${count}`);
      if (result) {
        const data = JSON.parse(result);
        for (const row of data) {
          treatments.push({
            _id: String(row._id || row.timestamp),
            created_at: new Date(row.timestamp).toISOString(),
            enteredBy: row.enteredBy || 'AndroidAPS',
            eventType: row.type || row.eventType || (row.insulin > 0 ? 'Correction Bolus' : 'Carb Correction'),
            insulin: row.insulin || 0,
            carbs: row.carbs || 0,
            notes: row.notes || '',
          });
        }
      }
    } catch (e) {
      console.log('[TREATMENTS] 无法读取治疗数据库:', e.message);
    }

    // 尝试通过 content provider 读取
    if (treatments.length === 0) {
      try {
        const result = await queryContent(
          `content://${CONFIG.aapsPackage}.provider/treatments`
        );
        if (result) {
          console.log('[TREATMENTS] Content provider 返回:', result.substring(0, 200));
        }
      } catch (e) {
        console.log('[TREATMENTS] Content provider 不可用');
      }
    }

    res.json(treatments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// 启动服务器
// ============================================================
app.listen(CONFIG.port, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('AndroidAPS Remote Server 已启动');
  console.log(`  端口: ${CONFIG.port}`);
  console.log(`  认证: ${CONFIG.token ? '已启用 (Bearer Token)' : '未启用'}`);
  console.log(`  SMS 模式: ${CONFIG.useSMS ? '已启用' : '未启用'}`);
  console.log(`  AndroidAPS 包名: ${CONFIG.aapsPackage}`);
  console.log('='.repeat(50));
  console.log('');
  console.log('API 端点:');
  console.log('  GET  /ping       - 健康检查');
  console.log('  POST /bolus      - 输注胰岛素 { insulin: number }');
  console.log('  POST /carbs      - 记录碳水 { carbs: number }');
  console.log('  POST /treatment  - 混合输注 { insulin?, carbs?, notes? }');
  console.log('  GET  /status     - 获取设备状态');
  console.log('  GET  /cgm        - 获取 CGM 数据');
  console.log('  GET  /treatments - 获取治疗历史');
  console.log('');
  console.log('提示: 确保手机和 Web 端在同一局域网内');
});

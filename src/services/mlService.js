const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ML_DIR = path.resolve(__dirname, "../../ml");
const TRAIN_SCRIPT = path.join(ML_DIR, "train_rf.py");
const PREDICT_SCRIPT = path.join(ML_DIR, "predict_rf.py");

// Detect python command
function getPythonCommand() {
  return process.env.PYTHON_CMD || "python";
}

/**
 * Run Random Forest prediction using the trained scikit-learn model
 * via child_process Python stdin/stdout.
 */
function predictRandomForest(inputFeatures) {
  return new Promise((resolve, reject) => {
    const pythonCmd = getPythonCommand();
    const child = spawn(pythonCmd, [PREDICT_SCRIPT], {
      cwd: ML_DIR,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Python predict_rf.py exited with code ${code}: ${stderr || stdout}`)
        );
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (err) {
        reject(
          new Error(`Failed to parse Python output: ${err.message}. Raw output: ${stdout}`)
        );
      }
    });

    // Write input JSON to stdin and end
    try {
      child.stdin.write(JSON.stringify(inputFeatures));
      child.stdin.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrain Random Forest model using real DB records + reference dataset
 * via child_process Python.
 */
function trainRandomForest(dbRecords = []) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(
      os.tmpdir(),
      `sg_retrain_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
    );

    try {
      fs.writeFileSync(tempFile, JSON.stringify(dbRecords, null, 2), "utf-8");
    } catch (err) {
      return reject(new Error(`Failed to write temp training data: ${err.message}`));
    }

    const pythonCmd = getPythonCommand();
    const child = spawn(pythonCmd, [TRAIN_SCRIPT, "--db-data", tempFile], {
      cwd: ML_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });

    child.on("close", (code) => {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}

      if (code !== 0) {
        return reject(
          new Error(`Python train_rf.py exited with code ${code}: ${stderr || stdout}`)
        );
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (err) {
        reject(
          new Error(`Failed to parse Python train output: ${err.message}. Raw output: ${stdout}`)
        );
      }
    });
  });
}

module.exports = {
  predictRandomForest,
  trainRandomForest,
};

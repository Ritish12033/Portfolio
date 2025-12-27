(async function () {
  
  async function waitForTf(timeout = 5000) {
    if (window.tf) return;
    const start = Date.now();
    return new Promise((resolve) => {
      const id = setInterval(() => {
        if (window.tf || (Date.now() - start) > timeout) {
          clearInterval(id);
          resolve();
        }
      }, 50);
    });
  }
  await waitForTf();

  // globals
  let model = null;
  let featureExtractor = null;
  let classes = []; // labels loaded from file
  const defaultClasses = ["left", "right", "up", "down"];

  const currentFacingMode = "user";
  const statusElement = document.getElementById("status");
  const video = document.getElementById("webcam");
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const modelFilesInput = document.getElementById("modelFilesInput");
  const loadModelButton = document.getElementById("loadModelButton");
  const startGameButton = document.getElementById("startGameButton");

  // Load MobileNet feature extractor
  async function loadFeatureExtractor() {
    if (!window.tf) return;
    try {
      const mobilenet = await tf.loadLayersModel(
        "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json"
      );
      const layer = mobilenet.getLayer("conv_pw_13_relu");
      featureExtractor = tf.model({ inputs: mobilenet.inputs, outputs: layer.output });
      console.log("MobileNet feature extractor loaded for snake.");
      if (statusElement) statusElement.innerText = "Feature extractor ready.";
    } catch (error) {
      console.error("Error loading feature extractor:", error);
      if (statusElement) statusElement.innerText = "Error loading feature extractor.";
    }
  }
  await loadFeatureExtractor();

  // Wire load button to file input
  loadModelButton.addEventListener("click", () => modelFilesInput.click());

  // Handle file selection and load model automatically
  modelFilesInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const modelJsonFile = files.find((f) => f.name.endsWith(".json") && !f.name.includes("labels") && !f.name.includes("metadata"));
    const metadataFile = files.find((f) => f.name.includes("labels") && f.name.endsWith(".json"));
    const weightsBinFile = files.find((f) => f.name.endsWith(".bin"));

    if (!modelJsonFile || !weightsBinFile) {
      if (statusElement) statusElement.innerText = "Error: Model JSON or BIN file not found.";
      return;
    }

    
    if (metadataFile) {
      try {
        const metadataText = await metadataFile.text();
        const metadataObj = JSON.parse(metadataText);
        classes = Array.isArray(metadataObj) ? metadataObj : metadataObj.labels || [];
        console.log("Extracted labels:", classes);
      } catch (error) {
        console.error("Error reading metadata JSON:", error);
      }
    }

    if (!classes || classes.length === 0) {
      classes = defaultClasses.slice();
      console.warn("No labels metadata found — using default classes:", classes);
    }

    // Load the model from the selected files
    try {
      statusElement.innerText = "Loading model...";
      model = await tf.loadLayersModel(tf.io.browserFiles([modelJsonFile, weightsBinFile]));
      statusElement.innerText = "Model loaded successfully.";
      startGameButton.disabled = false;

      // Start webcam automatically
      await startWebcam();

      // Optionally auto-start the game
      startGame();
    } catch (error) {
      console.error("Error loading model:", error);
      statusElement.innerText = "Error loading model.";
    }
  });

  // Start the webcam
  async function startWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusElement.innerText = "Webcam not supported in this browser.";
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } });
      video.srcObject = stream;
      await new Promise((resolve) => {
        video.onloadeddata = () => resolve();
      });
      video.play();
      console.log("Webcam started");
    } catch (error) {
      console.error("Error accessing webcam:", error);
      statusElement.innerText = "Error accessing webcam.";
    }
  }

  // ===========================
  // SNAKE GAME LOGIC
  // ===========================
  let snake = [];
  let snakeDir = "right";
  let food = { x: 0, y: 0 };
  const gridSize = 20;
  const canvasSize = 400;
  let gameInterval = null;
  const gameSpeed = 150;
  let score = 0;
  let gameRunning = false;

  function initGame() {
    snake = [{ x: 10, y: 10 }];
    snakeDir = "right";
    placeFood();
    drawGame();
  }

  function placeFood() {
    const numCells = canvasSize / gridSize;
    let attempts = 0;
    do {
      food.x = Math.floor(Math.random() * numCells);
      food.y = Math.floor(Math.random() * numCells);
      attempts++;
      // safety break to avoid infinite loop
      if (attempts > 1000) break;
    } while (snake.some(seg => seg.x === food.x && seg.y === food.y));
  }

  function updateGame() {
    let head = { ...snake[0] };

    // move head according to direction
    if (snakeDir === "right") head.x++;
    else if (snakeDir === "left") head.x--;
    else if (snakeDir === "up") head.y--;
    else if (snakeDir === "down") head.y++;

    const numCells = canvasSize / gridSize;
    // wrap around
    head.x = (head.x + numCells) % numCells;
    head.y = (head.y + numCells) % numCells;

    for (let i = 0; i < snake.length; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
    
        initGame();
        return;
      }
    }

    // add new head
    snake.unshift(head);

    // check if ate food
    if (head.x === food.x && head.y === food.y) {
      score++;
      
      placeFood();
     
      if (score >= 20) {
        
        if (gameInterval) {
          clearInterval(gameInterval);
          gameInterval = null;
        }
        gameRunning = false;
        statusElement.innerText = "You tried your best";
        drawGame();
        return;
      }
    } else {
      snake.pop();
    }

    drawGame();
  }

  function drawGame() {
    ctx.fillStyle = "#FFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#000";
    for (const segment of snake) {
      ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
    }

    ctx.fillStyle = "red";
    ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize, gridSize);

    // draw score
    ctx.fillStyle = "#000";
    ctx.font = "18px sans-serif";
    ctx.fillText(`Score: ${score}`, 8, 20);
  }

  // won === true => reached target (20) and show "You tried your best"
  function gameOver(won = false) {
    if (gameInterval) {
      clearInterval(gameInterval);
      gameInterval = null;
    }
    gameRunning = false;
    if (won) {
      statusElement.innerText = "You tried your best";
    } else {
      statusElement.innerText = "Score: " + score;
    }
  }

  function startGame() {
    if (gameInterval) clearInterval(gameInterval);
    initGame();
    score = 0;
    gameRunning = true;
    statusElement.innerText = "";
    gameInterval = setInterval(updateGame, gameSpeed);
    
    predictionLoop().catch(err => console.error(err));
  }

  // ===========================
  // HELPERS: map label text to one of the 4 directions
  // ===========================
  function labelToDirection(label) {
    if (!label) return null;
    const s = label.toLowerCase();
    if (s.includes("left")) return "left";
    if (s.includes("right")) return "right";
    if (s.includes("up") || s.includes("top")) return "up";
    if (s.includes("down") || s.includes("bottom")) return "down";
    // fallback: try exact matches with defaults
    const idx = classes.indexOf(label);
    if (idx >= 0 && defaultClasses[idx]) return defaultClasses[idx];
    return null;
  }

  // ===========================
  // MODEL PREDICTION LOOP (robust)
  // ===========================
  async function predictionLoop() {
    if (!model) {
      console.warn("No model loaded for predictions.");
      return;
    }
    if (!featureExtractor) {
      console.warn("No feature extractor loaded.");
      return;
    }

    while (gameRunning) {
      try {
        if (model && featureExtractor && video.readyState >= 2) {
          
          const features = tf.tidy(() => {
            const img = tf.browser.fromPixels(video).resizeNearestNeighbor([224, 224]).toFloat().div(127.5).sub(1).expandDims();
            const feats = featureExtractor.predict(img);
            return feats.clone();
          });

          // Predict using loaded classifier model
          const predsTensor = model.predict(features);
          const predictionsArray = Array.from(await predsTensor.data());
          
          predsTensor.dispose();
          features.dispose();

          // debug
          console.log("predictions:", predictionsArray, "labels:", classes);

          const maxIndex = predictionsArray.indexOf(Math.max(...predictionsArray));
          const predictedLabel = classes[maxIndex] || defaultClasses[maxIndex];
          const mappedDirection = labelToDirection(predictedLabel);
          if (!mappedDirection) {
            console.warn("Could not map label to a direction:", predictedLabel);
          } else {
            updateDirection(mappedDirection);
          }
        }
      } catch (err) {
        console.error("Prediction error:", err);
      }

      // yield to browser
      await tf.nextFrame();
    }
  }

  function updateDirection(predictedDirection) {
    if (!predictedDirection) return;
    if (predictedDirection === "left" && snakeDir !== "right") {
      snakeDir = "left";
    } else if (predictedDirection === "right" && snakeDir !== "left") {
      snakeDir = "right";
    } else if (predictedDirection === "up" && snakeDir !== "down") {
      snakeDir = "up";
    } else if (predictedDirection === "down" && snakeDir !== "up") {
      snakeDir = "down";
    }
  }

  startGameButton.addEventListener("click", () => startGame());

})();

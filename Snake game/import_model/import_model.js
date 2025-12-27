const startButton = document.getElementById("start");
const toggleCameraButton = document.getElementById("toggleCameraButton");
const modelFilesInput = document.getElementById("modelFilesInput");
const statusElement = document.getElementById("status");
const webcamElement = document.getElementById("webcam");

let model;
let featureExtractor;
let classes = [];
let currentFacingMode = "user";

async function loadFeatureExtractor() {
  try {
    // ensure tf is available
    if (!window.tf) throw new Error('tf not available');
    const mobilenet = await tf.loadLayersModel(
      'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json'
    );
    const layer = mobilenet.getLayer('conv_pw_13_relu');
    featureExtractor = tf.model({ inputs: mobilenet.inputs, outputs: layer.output });
    console.log("Feature extractor loaded.");
  } catch (error) {
    console.error("Error loading feature extractor:", error);
    statusElement.innerText = "Error loading feature extractor.";
  }
}
loadFeatureExtractor();

// Import model button event
startButton.onclick = () => modelFilesInput.click();

// Handle file selection for model import
modelFilesInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  const modelJsonFile = files.find(f => f.name.endsWith(".json") && !f.name.includes("labels") && !f.name.includes("metadata"));
  const metadataFile = files.find(f => f.name.includes("labels") && f.name.endsWith(".json"));
  const weightsBinFile = files.find(f => f.name.endsWith(".bin"));

  if (!modelJsonFile || !weightsBinFile) {
    statusElement.innerText = "Error: Model JSON or BIN file not found.";
    return;
  }

  // Load metadata
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

  // Load the model
  try {
    model = await tf.loadLayersModel(tf.io.browserFiles([modelJsonFile, weightsBinFile]));
    statusElement.innerText = "Model loaded successfully.";
    startWebcam();
  } catch (error) {
    console.error("Error loading model:", error);
    statusElement.innerText = "Error loading model.";
  }
});

// Start webcam
async function startWebcam() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const constraints = { video: { facingMode: currentFacingMode } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (webcamElement.srcObject) {
        webcamElement.srcObject.getTracks().forEach(track => track.stop());
      }
      
      webcamElement.srcObject = stream;
      webcamElement.addEventListener("loadeddata", predictLoop);
    } catch (error) {
      console.error("Error accessing webcam:", error);
    }
  }
}

// Toggle camera function
async function toggleCamera() {
  if (webcamElement.srcObject) {
    webcamElement.srcObject.getTracks().forEach(track => track.stop());
  }
  
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  await startWebcam();
  webcamElement.style.transform = currentFacingMode === "environment" ? "scaleX(1)" : "scaleX(-1)";
  alert(`Switched to ${currentFacingMode} camera`);
}

toggleCameraButton.addEventListener("click", toggleCamera);

// Prediction loop
async function predictLoop() {
  while (true) {
    tf.tidy(() => {
      let imgTensor = tf.browser.fromPixels(webcamElement)
        .resizeNearestNeighbor([224, 224])
        .toFloat()
        .expandDims()
        .div(127.5)
        .sub(1);

      const features = featureExtractor.predict(imgTensor);
      const predictions = model.predict(features).dataSync();

      updatePredictionUI(predictions);
    });
    await tf.nextFrame();
  }
}

// Update the UI with predictions
function updatePredictionUI(predictionsArray) {
  const predictionContainer = document.getElementById("prediction-container");
  predictionContainer.innerHTML = "";
  
  const labels = classes.length > 0 ? classes : predictionsArray.map((_, i) => `Class ${i}`);
  for (let i = 0; i < labels.length; i++) {
    const row = document.createElement("div");
    row.className = "prediction-row";

    const labelSpan = document.createElement("div");
    labelSpan.className = "prediction-label";
    labelSpan.innerText = labels[i];

    const barContainer = document.createElement("div");
    barContainer.className = "prediction-bar-container";

    const bar = document.createElement("div");
    bar.className = "prediction-bar";
    const percentage = Math.round(predictionsArray[i] * 100);
    bar.style.width = `${percentage}%`;

    const percSpan = document.createElement("div");
    percSpan.className = "prediction-percentage";
    percSpan.innerText = `${percentage}%`;

    barContainer.appendChild(bar);
    row.appendChild(labelSpan);
    row.appendChild(barContainer);
    row.appendChild(percSpan);
    predictionContainer.appendChild(row);
  }
}
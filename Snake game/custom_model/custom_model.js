
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
const model = (window.tf) ? tf.sequential() : null;
if (window.tf) console.log('tfjs version:', (tf && tf.version) ? (tf.version.tfjs || tf.version) : 'unknown');

// get references to DOM elements
const statusElement = document.getElementById("status");
const trainButton = document.getElementById("train");
const predictButton = document.getElementById("predict");
const saveButton = document.getElementById("save");
const webcamElement = document.getElementById("webcam");
const newClassInput = document.getElementById("new-class-name");
const addClassButton = document.getElementById("add-class-button");
const buttonsContainer = document.getElementById("buttons-container");
const predictionContainer = document.getElementById("prediction-container");
const toggleCameraButton = document.getElementById("toggle-camera");

// variables for models, webcam, and training state
let webcam, initialModel, newModel;
let isTraining = false;
let isPredicting = false;

// flag for mouse/touch down
let mouseDown = false;

// arrays to track class labels and sample counts
let labels = [];
let totals = [];

// arrays to store training examples (features and labels)
let xsArray = [];
let xyArray = [];


const learningRate = 0.0001;
const batchSizeFraction = 0.4;
const epochs = 30;
const denseUnits = 100;

// constants for limits
const maxExamplesPerClass = 75;
function isMobileDevice() {
  return /Mobi|Android/i.test(navigator.userAgent);
}
const maxClassesAllowed = isMobileDevice() ? 5 : 4;

//camera facing mode.
let currentFacingMode = "user";

/* Load MobileNet and return a truncated model for feature extraction */
async function loadModel() {
  const mobilenet = await tf.loadLayersModel(
    'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json'
  );
  const layer = mobilenet.getLayer("conv_pw_13_relu");
  return tf.model({ inputs: mobilenet.inputs, outputs: layer.output });
}

/* initialize the webcam and load the feature extractor model */
async function init() {
  try {
    // use tf.data.webcam
    webcam = await tf.data.webcam(webcamElement, { facingMode: currentFacingMode });
    initialModel = await loadModel();
    statusElement.innerText = "Model loaded";
    setTimeout(() => { statusElement.style.display = "none"; }, 1000);
  } catch (error) {
    console.error("Initialization failed:", error);
  
    let message = "Webcam initialization failed.";
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      message += " Please grant camera permissions.";
    } else if (error.name === "NotFoundError") {
      message += " No camera found.";
    }
  
    alert(message);
  }
}

init();

/* Toggle camera facing mode */
async function toggleCamera() {
  // recreate webcam stream using tf.data.webcam
  if (webcam && webcam.stop) { try { await webcam.stop(); } catch(e){} }
  webcam = await tf.data.webcam(webcamElement, { facingMode: currentFacingMode });
  webcamElement.style.transform = currentFacingMode === "environment" ? "scaleX(1)" : "scaleX(-1)";
  alert(`Switched to ${currentFacingMode} camera`);
}

toggleCameraButton?.addEventListener("click", toggleCamera);

/* Add a new custom class */
addClassButton.addEventListener("click", () => {
  const className = newClassInput.value.trim();
  if (!className) {
    alert("Enter a class name.");
    return;
  }
  if (labels.includes(className)) {
    alert("Class name already exists.");
    return;
  }
  if (labels.length >= maxClassesAllowed) {
    alert(`You can only add ${maxClassesAllowed} classes on this device.`);
    return;
  }
  addClass(className);
  newClassInput.value = "";
});

/* create new class and track it */
function addClass(className) {
  labels.push(className);
  totals.push(0);
  const index = labels.length - 1;

  const container = document.createElement("div");
  container.className = "class-container";

  const button = document.createElement("button");
  button.innerText = `Add ${className} sample`;
  button.className = "record-button";
  button.dataset.index = index;

  const countDisplay = document.createElement("span");
  countDisplay.id = `${className}-total`;
  countDisplay.innerText = "0";

  container.appendChild(button);
  container.appendChild(document.createTextNode(" Examples: "));
  container.appendChild(countDisplay);
  buttonsContainer.appendChild(container);

  //set the flag and call the handler
  button.addEventListener("mousedown", (e) => {
    e.preventDefault();
    mouseDown = true;
    handleAddExample(index, countDisplay, button);
  });
  button.addEventListener("touchstart", (e) => {
    e.preventDefault();
    mouseDown = true;
    handleAddExample(index, countDisplay, button);
  });
  // On mouseup and related events reset the flag
  button.addEventListener("mouseup", () => { mouseDown = false; });
  button.addEventListener("touchend", () => { mouseDown = false; });
  button.addEventListener("mouseleave", () => { mouseDown = false; });
  button.addEventListener("touchcancel", () => { mouseDown = false; });
}

/**
 * continuously add examples while the mouse or touch is held down
 * once the maximum examples are reached for this class disable the button
 */
async function handleAddExample(labelIndex, countDisplay, button) {
  while (mouseDown) {
    if (totals[labelIndex] >= maxExamplesPerClass) {
      button.disabled = true;
      break;
    }
    await addExample(labelIndex);
    totals[labelIndex]++;
    countDisplay.innerText = totals[labelIndex];
    await tf.nextFrame();
  }
}

/**
 * capture an image, extract features with MobileNet, and store the example
 */
async function addExample(index) {
  if (labels.length < 2) {
    alert("You must have at least 2 classes before adding examples.");
    return;
  }
  
  //capture and preprocess the image
  const img = await getImage();
  
  const example = tf.tidy(() => {
    return initialModel.predict(img).clone();
  });

  const y = tf.tidy(() => {
    return tf.oneHot(tf.tensor1d([index]).toInt(), labels.length).clone();
  });

  // Store training data.
  xsArray.push(example);
  xyArray.push(y);

  // dspose the original image tensor
  img.dispose();

  console.log("Memory after adding example:", tf.memory());
}

/**
 * capture a single frame from the webcam, resize, normalize, and clone the result
 */
async function getImage() {
  const img = await webcam.capture();
  const processedImg = tf.tidy(() => {
    const resizedImg = tf.image.resizeBilinear(img, [224, 224]);
    return resizedImg.expandDims(0).toFloat().div(127.5).sub(1).clone();
  });
  img.dispose();
  return processedImg;
}

/**
 * train the custom model on the collected data
 */
trainButton.addEventListener("click", async () => {
  if (xsArray.length === 0) {
    alert("Please add examples before training.");
    return;
  }
  statusElement.style.display = "block";
  statusElement.innerText = "Training...";
  trainButton.disabled = true;
  await train();
  trainButton.disabled = false;
});

async function train() {
  isTraining = true;
  if (newModel) {
    newModel.dispose();
    newModel = null;
  }
  statusElement.style.display = "block";
  statusElement.innerText = "Training...";
  trainButton.disabled = true;

  const xs = tf.tidy(() => tf.concat(xsArray, 0));
  const xy = tf.tidy(() => tf.concat(xyArray, 0));

  newModel = tf.sequential({
    layers: [
      tf.layers.flatten({
        inputShape: initialModel.outputs[0].shape.slice(1),
      }),
      tf.layers.dense({
        units: denseUnits,
        activation: "relu",
        kernelInitializer: "varianceScaling",
        useBias: true,
      }),
      tf.layers.dense({
        units: labels.length,
        kernelInitializer: "varianceScaling",
        useBias: true,
        activation: "softmax",
      }),
    ],
  });

  const optimizer = tf.train.adam(learningRate);
  newModel.compile({ optimizer: optimizer, loss: "categoricalCrossentropy" });

  const batchSize = Math.max(1, Math.floor(xs.shape[0] * batchSizeFraction));

  await newModel.fit(xs, xy, {
    batchSize,
    epochs,
    callbacks: {
      onBatchEnd: async (batch, logs) => {
        statusElement.innerText = `Training Ongoing...`;
        await tf.nextFrame();
      },
    },
  });

  statusElement.innerText = "Training Complete";
  isTraining = false;
  xs.dispose();
  xy.dispose();
  xsArray.forEach(t => t.dispose());
  xyArray.forEach(t => t.dispose());
  xsArray = [];
  xyArray = [];
}

/**
 * continuously predict the class from the webcam image and update the UI
 */
predictButton.addEventListener("click", async () => {
  if (!newModel) {
    alert("Please train the model before starting predictions.");
    return;
  }
  isPredicting = true;
  predictButton.disabled = true;
  while (isPredicting) {
    const img = await getImage();
    const predictionsArray = tf.tidy(() => {
      const features = initialModel.predict(img);
      const predictions = newModel.predict(features);
      return predictions.dataSync();
    });
    updatePredictionUI(predictionsArray);
    img.dispose();
    await tf.nextFrame();
  }
  predictButton.disabled = false;
});

/**
 * update the prediction UI with percentage bars
 */
function updatePredictionUI(predictionsArray) {
  predictionContainer.innerHTML = "";
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

/**
 * save the trained model locally
 */
saveButton.addEventListener("click", async () => {
  if (!newModel) {
    alert("Train a model before saving!");
    return;
  }
  const modelName = prompt("Enter a name for your model:");
  if (!modelName) {
    alert("Model name cannot be empty.");
    return;
  }
  try {
    // Save the model
    await newModel.save(`downloads://${modelName}`);

    // Save labels as JSON
    const labelsBlob = new Blob([JSON.stringify(labels)], { type: "application/json" });
    const labelsUrl = URL.createObjectURL(labelsBlob);
    const a = document.createElement("a");
    a.href = labelsUrl;
    a.download = `${modelName}_labels.json`;
    a.click();
    URL.revokeObjectURL(labelsUrl);

    alert(`Model and labels saved as ${modelName}`);
  } catch (error) {
    console.error("Error saving model:", error);
    alert("Failed to save model. Check console for details.");
  }
});
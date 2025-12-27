import * as tf from '@tensorflow/tfjs';
// Ensure tf is available
if (!window.tf) {
  console.warn('dataset.js: tf not found on window. Make sure tf.js script is loaded before this module.');
}

// Optionally set backend to 'cpu' for compatibility
// await tf.setBackend('cpu');

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------
const FINE_TUNE = false;    // Set to true to fine-tune the last layers of MobileNet
const AUGMENT_DATA = true;  // Set to true to apply on-the-fly augmentation during training

// --------------------------------------------------
// DOM ELEMENTS
// --------------------------------------------------
const statusElement = document.getElementById('status');
const loadTrainDataButton = document.getElementById('loadTrainDataButton');
const trainFilesInput = document.getElementById('trainFilesInput');
const loadTestDataButton = document.getElementById('loadTestDataButton');
const testFilesInput = document.getElementById('testFilesInput');
const trainModelButton = document.getElementById('trainModelButton');
const webcamElement = document.getElementById('webcam');
const toggleCameraButton = document.getElementById('toggleCameraButton');
const predictionContainer = document.getElementById('prediction-container');
const saveModelButton = document.getElementById('saveModelButton');

// --------------------------------------------------
// GLOBAL VARIABLES
// --------------------------------------------------
let trainExamples = [];
let trainLabels = [];
let testExamples = [];
let testLabels = [];
let mobilenetModel, classifierModel;
let webcamStream = null;
let isPredicting = false;
let labels = [];

// --------------------------------------------------
// MODEL LOADING & FINE-TUNING
// --------------------------------------------------
async function loadMobilenet() {
  const mobilenet = await tf.loadLayersModel(
    'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_1.0_224/model.json'
  );
  
  const layer = mobilenet.getLayer('conv_pw_13_relu');
  return tf.model({ inputs: mobilenet.inputs, outputs: layer.output });
}

async function init() {
  try {
    mobilenetModel = await loadMobilenet();
    if (!FINE_TUNE) {
      mobilenetModel.trainable = false;
    } else {
      // Unfreeze the last few layers to allow fine tuning
      const numLayersToUnfreeze = 5;
      for (let i = mobilenetModel.layers.length - numLayersToUnfreeze; i < mobilenetModel.layers.length; i++) {
        mobilenetModel.layers[i].trainable = true;
      }
    }
    statusElement.innerText = 'MobileNet loaded';
  } catch (err) {
    console.error('Error loading MobileNet:', err);
    statusElement.innerText = 'Failed to load MobileNet';
  }
}
init();

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------
async function loadImageTensor(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Resize to MobileNet's input size
        canvas.width = 224;
        canvas.height = 224;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 224, 224);
        let imgTensor = tf.browser.fromPixels(canvas, 3)
          .toFloat()
          .div(127.5)
          .sub(1);
        
        if (imgTensor.shape[2] === 1) {
          imgTensor = tf.tile(imgTensor, [1, 1, 3]);
        }
        resolve(imgTensor);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Custom rotate function to rotate an image tensor by 90° increments
 * Rotates counterclockwise
 */
function rotate90(tensor, k = 1) {
  let rotated = tensor;
  for (let i = 0; i < k; i++) {
    rotated = tf.tidy(() => {
      
      return tf.reverse(tf.transpose(rotated, [1, 0, 2]), 0);
    });
  }
  return rotated.clone();
}

/**
 * Safely flip a 3D image tensor left-right
 * Expands to 4D, applies flip, then squeezes back to 3D
 */
function safeFlipLeftRight(imageTensor) {
  return tf.tidy(() => {
    const batched = imageTensor.expandDims(0); // Shape: [1, h, w, c]
    const flipped = tf.image.flipLeftRight(batched);
    return flipped.squeeze(0);
  });
}

/**
 * Augment an image tensor with random flips and rotations
 */
function augmentImage(imageTensor) {
  return tf.tidy(() => {
    let augmented = imageTensor;
    if (Math.random() < 0.5) {
      augmented = safeFlipLeftRight(augmented);
    }
    const numRotations = Math.floor(Math.random() * 4);
    if (numRotations > 0) {
      augmented = rotate90(augmented, numRotations);
    }
    return augmented.clone();
  });
}

/**
 * Extract label from the file name
 * Adjust this function if your FER-2013 file naming convention is different
 */
function extractLabel(fileName) {
  const parts = fileName.split('-');
  if (parts.length < 2) {
    return fileName.split('.')[0].toLowerCase();
  }
  return parts[1].split('.')[0].toLowerCase();
}

/**
 * Log the training label distribution
 */
function logLabelDistribution() {
  const distribution = {};
  for (const idx of trainLabels) {
    const lab = labels[idx];
    distribution[lab] = (distribution[lab] || 0) + 1;
  }
  console.log('Training Label Distribution:', distribution);
}

async function computeFeaturesInBatches(images, batchSize = 16, augment = false) {
  const featuresList = [];
  for (let i = 0; i < images.length; i += batchSize) {
    const batchFeatures = tf.tidy(() => {
      let batch = images.slice(i, i + batchSize);
      if (augment) {
        // Augment each image.
        batch = batch.map(img => augmentImage(img));
      }
      const batchTensor = tf.stack(batch);
      const features = mobilenetModel.predict(batchTensor);
      return features.clone();
    });
    featuresList.push(batchFeatures);
    console.log(`Processed batch ${Math.floor(i / batchSize) + 1}`, "Memory:", tf.memory());
    await tf.nextFrame();
  }
  const featuresTensor = tf.tidy(() => {
    const concatFeatures = tf.concat(featuresList, 0);
    return concatFeatures.clone();
  });
  featuresList.forEach(t => t.dispose());
  return featuresTensor;
}

// --------------------------------------------------
// DATA LOADING
// --------------------------------------------------
loadTrainDataButton.addEventListener('click', () => {
  trainFilesInput.click();
});
trainFilesInput.addEventListener('change', async (event) => {
  trainExamples = [];
  trainLabels = [];
  labels = [];
  const files = Array.from(event.target.files);
  await Promise.all(files.map(async file => {
    const label = extractLabel(file.name);
    if (!labels.includes(label)) {
      labels.push(label);
    }
    try {
      const imgTensor = await loadImageTensor(file);
      trainExamples.push(imgTensor);
      trainLabels.push(labels.indexOf(label));
    } catch (err) {
      console.error(`Error loading training image ${file.name}:`, err);
    }
  }));
  logLabelDistribution();
  statusElement.innerText = `Loaded ${trainExamples.length} training images.`;
});

loadTestDataButton.addEventListener('click', () => {
  testFilesInput.click();
});
testFilesInput.addEventListener('change', async (event) => {
  testExamples = [];
  testLabels = [];
  const files = Array.from(event.target.files);
  await Promise.all(files.map(async file => {
    const label = extractLabel(file.name);
    if (!labels.includes(label)) return;
    try {
      const imgTensor = await loadImageTensor(file);
      testExamples.push(imgTensor);
      testLabels.push(labels.indexOf(label));
    } catch (err) {
      console.error(`Error loading testing image ${file.name}:`, err);
    }
  }));
  statusElement.innerText += `\nLoaded ${testExamples.length} testing images.`;
});

// --------------------------------------------------
// MODEL CREATION & TRAINING
// --------------------------------------------------

function createClassifierModel() {
  const numClasses = labels.length;
  const model = tf.sequential();
  model.add(tf.layers.flatten({ inputShape: mobilenetModel.outputs[0].shape.slice(1) }));
  model.add(tf.layers.dense({
    units: 100,
    activation: 'relu',
    kernelInitializer: 'varianceScaling'
  }));
  model.add(tf.layers.dense({
    units: 64,
    activation: 'relu',
    kernelInitializer: 'varianceScaling'
  }));
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({
    units: numClasses,
    activation: 'softmax',
    kernelInitializer: 'varianceScaling'
  }));
  const optimizer = tf.train.adam(0.0001);
  model.compile({ optimizer: optimizer, loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return model;
}

trainModelButton.addEventListener('click', async () => {
  if (trainExamples.length === 0) {
    alert('Please load training data first.');
    return;
  }
  
  statusElement.style.display = 'block';
  statusElement.innerText = 'Training...';
  console.log("Memory usage before training:", tf.memory());
  
  try {
    
    const xs = await computeFeaturesInBatches(trainExamples, 16, AUGMENT_DATA);
    const ys = tf.tidy(() => tf.oneHot(tf.tensor1d(trainLabels, 'int32'), labels.length));
    
    classifierModel = createClassifierModel();
    const fixedBatchSize = 16;
    
    
    await classifierModel.fit(xs, ys, {
      batchSize: fixedBatchSize,
      epochs: 10,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          const acc = logs.acc || logs.accuracy;
          statusElement.innerText = `Epoch ${epoch + 1} / 10 - Loss: ${logs.loss.toFixed(5)} - Accuracy: ${acc.toFixed(5)} - Val Loss: ${logs.val_loss.toFixed(5)}`;
          console.log("Memory usage during training:", tf.memory());
          await tf.nextFrame();
        },
        onBatchEnd: async () => {
          await tf.nextFrame();
        }
      }
    });
    statusElement.innerText = 'Training Complete';
    console.log("Memory usage after training:", tf.memory());
    
    // Dispose training tensors
    xs.dispose();
    ys.dispose();
    trainExamples.forEach(t => t.dispose());
    trainExamples = [];
    
    
    if (testExamples.length > 0) {
      const testXs = await computeFeaturesInBatches(testExamples, 16, false);
      const testYs = tf.tidy(() => tf.oneHot(tf.tensor1d(testLabels, 'int32'), labels.length));
      const evalOutput = classifierModel.evaluate(testXs, testYs);
      const testLoss = evalOutput[0].dataSync()[0].toFixed(3);
      const testAcc = evalOutput[1].dataSync()[0].toFixed(3);
      statusElement.innerText += `\nTest Loss: ${testLoss}, Test Accuracy: ${testAcc}`;
      console.log("Memory usage after evaluation:", tf.memory());
      testXs.dispose();
      testYs.dispose();
      testExamples.forEach(t => t.dispose());
      testExamples = [];
    }
    
    // Warm-up prediction
    tf.tidy(() => {
      const warmUpTensor = tf.zeros([1].concat(mobilenetModel.outputs[0].shape.slice(1)));
      const warmUpPred = classifierModel.predict(warmUpTensor);
      warmUpPred.dispose();
    });
    
    // Setup webcam and start prediction loop
    await setupWebcam();
    isPredicting = true;
    predictLoop();
  } catch (error) {
    console.error('Error during training:', error);
    statusElement.innerText = 'Error during training.';
  }
});

// --------------------------------------------------
// WEBCAM PREDICTION & UTILITY FUNCTIONS
// --------------------------------------------------
async function setupWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
    webcamElement.srcObject = webcamStream;
    return new Promise(resolve => webcamElement.onloadedmetadata = resolve);
  } catch (err) {
    console.error('Error accessing webcam:', err);
    alert('Could not access the webcam.');
    throw err;
  }
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
  }
}

function updatePredictionUI(predictionArray) {
  predictionContainer.innerHTML = '';
  for (let i = 0; i < predictionArray.length; i++) {
    const row = document.createElement('div');
    row.className = 'prediction-row';
    const labelDiv = document.createElement('div');
    labelDiv.className = 'prediction-label';
    labelDiv.innerText = labels[i] || `Class ${i}`;
    const barContainer = document.createElement('div');
    barContainer.className = 'prediction-bar-container';
    const bar = document.createElement('div');
    bar.className = 'prediction-bar';
    const percentage = Math.round(predictionArray[i] * 100);
    bar.style.width = `${percentage}%`;
    const percText = document.createElement('div');
    percText.className = 'prediction-percentage';
    percText.innerText = `${percentage}%`;
    barContainer.appendChild(bar);
    row.appendChild(labelDiv);
    row.appendChild(barContainer);
    row.appendChild(percText);
    predictionContainer.appendChild(row);
  }
}

/**
 * Continuously predict from the webcam stream
 */
async function predictLoop() {
  if (!classifierModel) {
    alert('Please train the model first.');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');

  while (isPredicting) {
    const predictionArray = tf.tidy(() => {
      ctx.drawImage(webcamElement, 0, 0, 224, 224);
      const imgTensor = tf.browser.fromPixels(canvas, 3)
        .toFloat()
        .div(127.5)
        .sub(1)
        .expandDims(0);
      const features = mobilenetModel.predict(imgTensor);
      const prediction = classifierModel.predict(features);
      return prediction.dataSync();
    });
    updatePredictionUI(Array.from(predictionArray));
    await tf.nextFrame();
  }
}

// --------------------------------------------------
// WEBCAM TOGGLE BUTTON
// --------------------------------------------------
toggleCameraButton.addEventListener('click', async () => {
  toggleCameraButton.disabled = true;
  if (isPredicting) {
    isPredicting = false;
    stopWebcam();
    statusElement.innerText = 'Camera stopped.';
    toggleCameraButton.disabled = false;
  } else {
    try {
      await setupWebcam();
      statusElement.innerText = 'Camera started. Running predictions...';
      isPredicting = true;
      predictLoop();
    } catch (err) {
      console.error('Error starting webcam:', err);
    }
    toggleCameraButton.disabled = false;
  }
});

// --------------------------------------------------
// SAVE MODEL FUNCTIONALITY
// --------------------------------------------------
saveModelButton.addEventListener('click', async () => {
  if (!classifierModel) {
    alert('Train a model before saving!');
    return;
  }
  const modelName = prompt('Enter a name for your model:');
  if (!modelName) {
    alert('Model name cannot be empty.');
    return;
  }
  try {
    await classifierModel.save(`downloads://${modelName}`);
    const labelsBlob = new Blob([JSON.stringify(labels)], { type: 'application/json' });
    const labelsUrl = URL.createObjectURL(labelsBlob);
    const a = document.createElement('a');
    a.href = labelsUrl;
    a.download = `${modelName}_labels.json`;
    a.click();
    URL.revokeObjectURL(labelsUrl);
    alert(`Model and labels saved as ${modelName}`);
  } catch (error) {
    console.error('Error saving model:', error);
    alert('Failed to save model. Check console for details.');
  }
});

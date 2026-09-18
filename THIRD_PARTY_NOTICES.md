# Model and dependency credits

Chroma uses the pretrained **Colorful Image Colorization** model (ECCV 2016) by Richard Zhang, Phillip Isola, and Alexei A. Efros.

- Paper and project: https://richzhang.github.io/colorization/
- Official code and model architecture: https://github.com/richzhang/colorization/tree/caffe
- Model repository license: https://github.com/richzhang/colorization/blob/caffe/LICENSE
- Official OpenCV model manifest and reference hashes: https://github.com/opencv/opencv_extra/blob/4.x/testdata/dnn/download_models.py
- Official OpenCV integration reference: https://github.com/opencv/opencv/blob/4.x/samples/dnn/colorization.py

The setup script retrieves the model architecture and color-cluster array from the authors' repository, weights from OpenCV's model host (or the checksum-verified community mirror linked in https://github.com/AbhilipsaJena/Image_colorization-OpenCV), and the authors' license into `backend/models/MODEL_LICENSE.txt`. Preserve that license when redistributing the model. The `.gitignore` excludes model assets from future source commits; the download script allows reproducible installation.

The local inference implementation follows the model's documented CIE Lab preprocessing and reconstruction method. No training dataset is bundled. Three sample photographs are bundled as grayscale JPEG derivatives. The empty-state landscape illustration is original CSS artwork and is not presented as a model result.

React, TypeScript, Vite, Lucide, fflate, FastAPI, Uvicorn, NumPy, OpenCV, Pillow, and the testing libraries retain their respective upstream licenses. Installed packages include their license metadata. Review those licenses and the model's license for your intended redistribution.

## Bundled sample photos

The UI serves these samples from `frontend/public/samples/`; it makes no external image requests at runtime. Images were converted to grayscale for testing.

| Sample | Credit and license | Upstream asset |
| --- | --- | --- |
| Portrait of astronaut Eileen Collins | NASA, public domain | https://github.com/scikit-image/scikit-image/blob/v0.19.3/skimage/data/astronaut.png |
| Coffee | Rachel Michetti, CC0; courtesy of Pikolo Espresso Bar | https://github.com/scikit-image/scikit-image/blob/v0.19.3/skimage/data/coffee.png |
| Falcon 9 rocket launch | SpaceX, public domain | https://github.com/scikit-image/scikit-image/blob/v0.19.3/skimage/data/rocket.jpg |

Credit and licensing information: https://scikit-image.org/docs/stable/api/skimage.data.html (astronaut, coffee, rocket). These are test inputs, not promised examples of recovered original colors.

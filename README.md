# NikaAI



Chat with an anime character through a text box — she talks back and animates in response.



## Features



- Text chat with an anime character front-end

- Character animations (auto-blinking, reacts to conversation)

- Eyes track the mouse cursor

- Session-based memory (handled on the backend)

- Python backend + HTML/JS frontend


## Requirements

- Python 3.10
- Node.js / npm


## Installation


### Windows
```bash
npm install

py -3.10 -m venv .venv

.venv\Scripts\activate

pip install -r requirements.txt
```

### Linux/macOS
```bash
npm install

python3.10 -m venv .venv

source .venv/bin/activate

pip install -r requirements.txt
```

### Create a `.env` file in the project root:

```env
API_KEY=your_api_key

BASE_URL=your_base_url

MODEL=your_model
```

### Launch the app:

```bash
run.bat     # Windows
run.sh      # Linux/macOS
```

## License


MIT — do whatever you want with it.
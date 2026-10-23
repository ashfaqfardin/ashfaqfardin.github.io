## Local RAG API with Ollama | [GitHub](https://github.com/ashfaqfardin/local-rag-api-with-ollama)

A fully local retrieval-augmented generation API built with FastAPI, ChromaDB, and Ollama. Submitted text is split into chunks, embedded with nomic-embed-text, and stored in a persistent vector database. Questions retrieve the most relevant passages, which Qwen 2.5 uses to produce grounded answers, with optional per-user filtering. Read the [build walkthrough](https://nextwork.ai/ashfaqfardin/docs/99ec4595-3d7b-5584-a799-aafb9c373bbb).

## Package Recognizer | [GitHub](https://github.com/ashfaqfardin/Package-Recognizer)

An image classifier that sorts photos of everyday product packaging into 12 categories, from bottled water to detergent packs, for recycling, sorting, and inventory use cases. A ResNet34 model (with MobileNetV3 for comparison) is fine-tuned with FastAI and served through a Gradio interface. [Try the live demo](https://huggingface.co/spaces/ashfaqfardin/pkg_recognizer) on Hugging Face Spaces.

## Global University Rankings Analytics | [GitHub](https://github.com/ashfaqfardin/Global-University-Rankings-Analytics)

A Selenium scraper that sweeps the virtualized table of the THE World University Rankings to collect every ranked institution, followed by data cleaning in Python and an interactive Tableau dashboard. The analysis explores how research quality, international outlook, and industry income relate to teaching scores, and where top-ranked universities are concentrated. [View the dashboard](https://public.tableau.com/app/profile/mohammad.ashfaq.ur.rahman/viz/GlobalUniversityRankingsAnalytics/GlobalUniversityRankingAnalysis).

## SLM Based Python Tutoring System | Private Repository

A Python tutoring system using React for the frontend and FastAPI for backend interactions. Employs the fine-tuned Gemma 2B model on a synthetic dataset. Future iterations will focus on making the system model-agnostic and adding various agents to improve functionality.

## EasyOCR Form App | [GitHub](https://github.com/ashfaqfardin/Useless_OCR)

A full-stack OCR and annotation tool built with Next.js, shadcn UI, and FastAPI. Users upload an image, extract text and bounding boxes with EasyOCR, Groq's Llama 4 Maverick vision model, or a hybrid of both, then edit the boxes and export the results as JSON. Supports multiple languages, including Bangla. The OCR pipelines are still experimental.

## DocKylin Reimplementation | [GitHub](https://github.com/ashfaqfardin/DocKylin_Reimplemented)

A PyTorch reimplementation of DocKylin (AAAI 2025), a multimodal model for visual document understanding. Connects a Swin Transformer vision encoder to Qwen 1.5 (1.8B) through an MLP projector, and integrates the paper's Adaptive Pixel Slimming and Dynamic Token Slimming to cut redundant pixels and visual tokens. Includes pretraining, fine-tuning, and evaluation scripts on FUNSD.

## Local Chat Application | [GitHub](https://github.com/ashfaqfardin/local-chat-app)

A real-time chat application for local network communication, built with React (TypeScript), Socket.IO, Tailwind CSS, Node.js, and Express. Features real-time messaging, file sharing, user presence detection, and customizable avatars, all within a responsive UI.

## DL Code Organization | [GitHub](https://github.com/ashfaqfardin/DL_Code_Organization)

A hands-on session on deep learning code management using PyTorch, organized by CCDS.AI at IUB. Covers code structuring, experiment tracking, and model training workflows with a CLI for training/testing.

## Quiz Application | [GitHub](https://github.com/ashfaqfardin/quiz_app)

A Flutter-based mobile quiz app featuring a multiple-choice format, smooth navigation, and a responsive UI for both Android and iOS. Built with Dart and Flutter.

import sys

# Try to import required packages
try:
    from transformers import GPT2Tokenizer, GPT2LMHeadModel
    import torch
except ImportError as e:
    # Print helpful error message with installation instructions
    print("Error: Missing required dependencies.")
    print(f"Import error: {e}")
    print("\nPlease install required packages with the following command:")
    print("pip install torch transformers")
    print("\nIf you're using a virtual environment or conda, make sure it's activated.")
    print("For Apple Silicon Macs, you might need: pip install torch==2.0.0 transformers==4.28.0")
    sys.exit(1)

try:
    # 加载模型和分词器
    tokenizer = GPT2Tokenizer.from_pretrained("gpt2")
    model = GPT2LMHeadModel.from_pretrained("gpt2")

    # 获取命令行参数作为 prompt，如果没有则使用默认值
    prompt = "今天的水质状况是"
    if len(sys.argv) > 1:
        prompt = sys.argv[1]

    input_ids = tokenizer.encode(prompt, return_tensors="pt")

    # 生成文本
    output = model.generate(
        input_ids,
        max_length=50,
        do_sample=True,
        top_k=50,
        temperature=0.9
    )

    # 解码输出
    generated_text = tokenizer.decode(output[0], skip_special_tokens=True)
    print(generated_text)
    
except Exception as e:
    print(f"Error running GPT-2 model: {e}")
    sys.exit(1)
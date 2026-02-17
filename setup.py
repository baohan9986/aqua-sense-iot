from setuptools import setup, find_packages

setup(
    name="liquid_spoilage_iot",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        "torch>=1.13.0",
        "transformers>=4.25.1",
        "numpy>=1.19.0",
    ],
)

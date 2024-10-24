# Base image for Node.js
FROM node:23-alpine

# Create and set working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the project files (e.g., tests)
COPY . .

# Run tests using a script defined in package.json
CMD ["npm", "run", "test"]

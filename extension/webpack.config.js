const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    sidebar: ['./src/sidebar/sidebar.ts', './src/sidebar/styles.css', './src/sidebar/sidebar.css'],
    background: './src/background/background.ts',
    'webrtc-content': './src/content/webrtc-content.ts',
    'webrtc-injector': './src/webrtc-injector/webrtc-injector.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { 
          from: 'src/manifest.json',
          to: 'manifest.json'
        },
        { 
          from: 'src/assets',
          to: 'assets'
        },
        {
          from: 'src/sidebar/sidebar.html',
          to: 'sidebar.html'
        },

      ],
    }),
  ],
};
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { compareImagesAndCharts } from './compareImagesAndCharts';

// Mock fs and path modules
jest.mock('fs');
jest.mock('path');
jest.mock('yaml');

describe('compareImagesAndCharts', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock path.join to return the input path
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

    // Mock console.log and console.error to prevent output during tests
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should detect image updates', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock yaml.parse to return different content based on the input
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old') {
        return {
          'chart1': '1.0.0',
          'chart2': '2.0.0'
        };
      }
      if (content === 'charts-new') {
        return {
          'chart1': '1.0.0',
          'chart2': '2.0.0'
        };
      }
      if (content === 'images-old') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ],
          '8.12.1': [
            'docker.io/curlimages/curl:8.12.1',
            'registry1.dso.mil/ironbank/curl:8.12.1',
            'cgr.dev/chainguard/curl:8.12.1'
          ]
        };
      }
      if (content === 'images-new') {
        return {
          '1.25.3': [
            'docker.io/library/nginx:1.25.3',
            'registry1.dso.mil/ironbank/nginx:1.25.3',
            'cgr.dev/chainguard/nginx:1.25.3'
          ],
          '8.12.1': [
            'docker.io/curlimages/curl:8.12.1',
            'registry1.dso.mil/ironbank/curl:8.12.1',
            'cgr.dev/chainguard/curl:8.12.1'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    // With our updated logic, we should have needs-review since all images are updated properly
    expect(result.labels).toContain('needs-review');
    expect(result.labels).not.toContain('waiting on ironbank');
    expect(result.labels).not.toContain('waiting on cgr');
  });

  it('should detect major image updates', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock yaml.parse to return different content based on the input
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old') {
        return {
          'chart1': '1.0.0',
          'chart2': '2.0.0'
        };
      }
      if (content === 'charts-new') {
        return {
          'chart1': '1.0.0',
          'chart2': '2.0.0'
        };
      }
      if (content === 'images-old') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ],
          '8.12.1': [
            'docker.io/curlimages/curl:8.12.1',
            'registry1.dso.mil/ironbank/curl:8.12.1',
            'cgr.dev/chainguard/curl:8.12.1'
          ]
        };
      }
      if (content === 'images-new') {
        return {
          '2.0.0': [
            'docker.io/library/nginx:2.0.0',
            'registry1.dso.mil/ironbank/nginx:2.0.0',
            'cgr.dev/chainguard/nginx:2.0.0'
          ],
          '8.12.1': [
            'docker.io/curlimages/curl:8.12.1',
            'registry1.dso.mil/ironbank/curl:8.12.1',
            'cgr.dev/chainguard/curl:8.12.1'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    expect(result.labels).toContain('major-image-update');
    expect(result.changes).toContain('Major image update detected: 1.21.6 to 2.0.0');
  });

  it('should detect chart updates', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock yaml.parse to return different content based on the input
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old') {
        return {
          'chart1': '1.0.0',
          'chart2': '2.0.0'
        };
      }
      if (content === 'charts-new') {
        return {
          'chart1': '1.0.0',
          'chart2': '2.1.0'
        };
      }
      if (content === 'images-old') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ]
        };
      }
      if (content === 'images-new') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    expect(result.labels).toContain('needs-review');
    expect(result.changes).toContain('Chart chart2 updated from 2.0.0 to 2.1.0');
    expect(result.labels).toContain('helm-chart-only');
    expect(result.changes).toContain('PR contains only helm chart updates');
  });

  it('should detect major chart updates', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock yaml.parse to return different content based on the input
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old') {
        return {
          'chart1': '1.0.0',
          'chart2': '2.0.0'
        };
      }
      if (content === 'charts-new') {
        return {
          'chart1': '1.0.0',
          'chart2': '3.0.0'
        };
      }
      if (content === 'images-old') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ]
        };
      }
      if (content === 'images-new') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    expect(result.labels).toContain('needs-review');
    expect(result.labels).toContain('major-helm-update');
    expect(result.changes).toContain('Chart chart2 updated from 2.0.0 to 3.0.0');
    expect(result.changes).toContain('Major helm chart update detected for chart2');
    expect(result.labels).toContain('helm-chart-only');
    expect(result.changes).toContain('PR contains only helm chart updates');
  });

  it('should detect waiting on ironbank', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock yaml.parse to return different content based on the input
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old') {
        return {
          'chart1': '1.0.0'
        };
      }
      if (content === 'charts-new') {
        return {
          'chart1': '1.0.0'
        };
      }
      if (content === 'images-old') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ]
        };
      }
      if (content === 'images-new') {
        return {
          '1.25.3': [
            'docker.io/library/nginx:1.25.3',
          ],
          '1.22.6': [
            'registry1.dso.mil/ironbank/nginx:1.22.6'
          ],
          '1.21.6': [
            'cgr.dev/chainguard/nginx:1.21.6'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    expect(result.labels).toContain('waiting on ironbank');
    expect(result.changes).toContain('Waiting on Ironbank image update: registry1.dso.mil/ironbank/nginx:1.21.6');
  });

  it('should detect waiting on cgr', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock yaml.parse to return different content based on the input
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old') {
        return {
          'chart1': '1.0.0'
        };
      }
      if (content === 'charts-new') {
        return {
          'chart1': '1.0.0'
        };
      }
      if (content === 'images-old') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ]
        };
      }
      if (content === 'images-new') {
        return {
          '1.25.3': [
            'docker.io/library/nginx:1.25.3',
            'registry1.dso.mil/ironbank/nginx:1.25.3',
          ],
          '1.21.6': [
            'cgr.dev/chainguard/nginx:1.21.6'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    expect(result.labels).toContain('waiting on cgr');
    expect(result.changes).toContain('Waiting on Chainguard image update: cgr.dev/chainguard/nginx:1.21.6');
  });

  it('should handle mixed image updates with some waiting', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock yaml.parse to return different content based on the input
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old') {
        return {
          'chart1': '1.0.0'
        };
      }
      if (content === 'charts-new') {
        return {
          'chart1': '1.0.0'
        };
      }
      if (content === 'images-old') {
        return {
          '1.21.6': [
            'docker.io/library/nginx:1.21.6',
            'registry1.dso.mil/ironbank/nginx:1.21.6',
            'cgr.dev/chainguard/nginx:1.21.6'
          ],
          '8.12.1': [
            'docker.io/curlimages/curl:8.12.1',
            'registry1.dso.mil/ironbank/curl:8.12.1',
            'cgr.dev/chainguard/curl:8.12.1'
          ]
        };
      }
      if (content === 'images-new') {
        return {
          '1.25.3': [
            'docker.io/library/nginx:1.25.3',
          ],
          '1.22.6': [
            'registry1.dso.mil/ironbank/nginx:1.22.6'
          ],
          '1.21.6': [
            'cgr.dev/chainguard/nginx:1.21.6'
          ],
          '8.12.1': [
            'docker.io/curlimages/curl:8.12.1',
            'registry1.dso.mil/ironbank/curl:8.12.1',
            'cgr.dev/chainguard/curl:8.12.1'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    // With our updated logic, we should have waiting labels since some images are outdated
    expect(result.labels).toContain('waiting on ironbank');
    expect(result.labels).toContain('waiting on cgr');
    expect(result.labels).not.toContain('needs-review');
  });

  it('should handle empty files gracefully', async () => {
    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock fs.readFileSync to return empty content for new/images.yaml
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return '   '; // Empty file with whitespace
      }
      return '';
    });

    // Mock yaml.parse to return valid content for non-empty files
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old' || content === 'charts-new') {
        return { 'chart1': '1.0.0' };
      }
      if (content === 'images-old') {
        return { '1.21.6': ['docker.io/library/nginx:1.21.6'] };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    // Should complete successfully with empty new/images.yaml
    expect(result.labels).toContain('needs-review');
  });

  it('should throw an error if old images file is missing', async () => {
    // Mock fs.existsSync to return false for old/images.yaml
    (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
      return filePath !== 'old/images.yaml';
    });

    // Mock fs.readFileSync to return content for other files
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock yaml.parse to return valid content
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old' || content === 'charts-new') {
        return { 'chart1': '1.0.0' };
      }
      if (content === 'images-new') {
        return { '1.21.6': ['docker.io/library/nginx:1.21.6'] };
      }
      return {};
    });

    await expect(compareImagesAndCharts('old', 'new')).rejects.toThrow('File does not exist: old/images.yaml');
  });

  it('should throw an error if new images file is missing', async () => {
    // Mock fs.existsSync to return false for new/images.yaml
    (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
      return filePath !== 'new/images.yaml';
    });

    // Mock fs.readFileSync to return content for other files
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      return '';
    });

    // Mock yaml.parse to return valid content
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old' || content === 'charts-new') {
        return { 'chart1': '1.0.0' };
      }
      if (content === 'images-old') {
        return { '1.21.6': ['docker.io/library/nginx:1.21.6'] };
      }
      return {};
    });

    await expect(compareImagesAndCharts('old', 'new')).rejects.toThrow('File does not exist: new/images.yaml');
  });

  it('should throw an error if old charts file is missing', async () => {
    // Mock fs.existsSync to return false for old/charts.yaml
    (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
      return filePath !== 'old/charts.yaml';
    });

    // Mock fs.readFileSync to return content for other files
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock yaml.parse to return valid content
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-new') {
        return { 'chart1': '1.0.0' };
      }
      if (content === 'images-old' || content === 'images-new') {
        return { '1.21.6': ['docker.io/library/nginx:1.21.6'] };
      }
      return {};
    });

    await expect(compareImagesAndCharts('old', 'new')).rejects.toThrow('File does not exist: old/charts.yaml');
  });

  it('should throw an error if new charts file is missing', async () => {
    // Mock fs.existsSync to return false for new/charts.yaml
    (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
      return filePath !== 'new/charts.yaml';
    });

    // Mock fs.readFileSync to return content for other files
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock yaml.parse to return valid content
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old') {
        return { 'chart1': '1.0.0' };
      }
      if (content === 'images-old' || content === 'images-new') {
        return { '1.21.6': ['docker.io/library/nginx:1.21.6'] };
      }
      return {};
    });

    await expect(compareImagesAndCharts('old', 'new')).rejects.toThrow('File does not exist: new/charts.yaml');
  });

  it('should throw an error if a file contains invalid YAML', async () => {
    // Mock fs.existsSync to return true for all files
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock fs.readFileSync to return content for all files
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return 'charts-old';
      }
      if (filePath === 'new/charts.yaml') {
        return 'charts-new';
      }
      if (filePath === 'old/images.yaml') {
        return 'images-old';
      }
      if (filePath === 'new/images.yaml') {
        return 'images-new';
      }
      return '';
    });

    // Mock yaml.parse to throw an error for new/images.yaml
    (yaml.parse as jest.Mock).mockImplementation((content) => {
      if (content === 'charts-old' || content === 'charts-new') {
        return { 'chart1': '1.0.0' };
      }
      if (content === 'images-old') {
        return { '1.21.6': ['docker.io/library/nginx:1.21.6'] };
      }
      if (content === 'images-new') {
        throw new Error('Invalid YAML');
      }
      return {};
    });

    await expect(compareImagesAndCharts('old', 'new')).rejects.toThrow('Invalid YAML');
  });

  it('should handle images without matches in other flavors', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return '';
      }
      if (filePath === 'new/charts.yaml') {
        return '';
      }
      if (filePath === 'old/images.yaml') {
        return {
          '1.0.0': [
            'docker.io/library/busybox:1.0.0',
          ]
        };
      }
      if (filePath === 'new/images.yaml') {
        return {
          '1.1.0': [
            'docker.io/library/busybox:1.1.0',
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    expect(result.labels).toContain('needs-review');
    expect(result.labels).not.toContain('waiting on ironbank');
    expect(result.labels).not.toContain('waiting on cgr');
  });

  it('should handle helm chart only update', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return {
          'grafana': '6.50.5',
          'prometheus': '15.18.0'
        };
      }
      if (filePath === 'new/charts.yaml') {
        return {
          'grafana': '6.50.7',
          'prometheus': '15.18.0'
        };
      }
      if (filePath === 'old/images.yaml') {
        return {
          '1.0.0': [
            'docker.io/library/nginx:1.0.0'
          ]
        };
      }
      if (filePath === 'new/images.yaml') {
        return {
          '1.0.0': [
            'docker.io/library/nginx:1.0.0'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    expect(result.labels).toContain('needs-review');
    expect(result.labels).toContain('helm-chart-only');
    expect(result.labels).not.toContain('waiting on ironbank');
    expect(result.labels).not.toContain('waiting on cgr');
    expect(result.labels).not.toContain('major-helm-update');
    expect(result.labels).not.toContain('major-image-update');
    expect(result.changes).toContain('Chart grafana updated from 6.50.5 to 6.50.7');
    expect(result.changes).toContain('PR contains only helm chart updates');
  });

  it('should detect major helm chart update', async () => {
    // Mock fs.readFileSync to return different content based on the file path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === 'old/charts.yaml') {
        return {
          'grafana': '6.50.5',
          'prometheus': '15.18.0'
        };
      }
      if (filePath === 'new/charts.yaml') {
        return {
          'grafana': '7.0.0',
          'prometheus': '15.18.0'
        };
      }
      if (filePath === 'old/images.yaml') {
        return {
          '1.0.0': [
            'docker.io/library/nginx:1.0.0'
          ]
        };
      }
      if (filePath === 'new/images.yaml') {
        return {
          '1.0.0': [
            'docker.io/library/nginx:1.0.0'
          ]
        };
      }
      return {};
    });

    const result = await compareImagesAndCharts('old', 'new');

    expect(result.labels).toContain('needs-review');
    expect(result.labels).toContain('major-helm-update');
    expect(result.labels).toContain('helm-chart-only');
    expect(result.labels).not.toContain('waiting on ironbank');
    expect(result.labels).not.toContain('waiting on cgr');
    expect(result.changes).toContain('Chart grafana updated from 6.50.5 to 7.0.0');
    expect(result.changes).toContain('Major helm chart update detected for grafana');
    expect(result.changes).toContain('PR contains only helm chart updates');
  });
});

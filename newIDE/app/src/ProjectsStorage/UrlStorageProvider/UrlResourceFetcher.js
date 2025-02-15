// @flow
import PromisePool from '@supercharge/promise-pool';
import axios from 'axios';
import { type FileMetadata } from '../index';

const isURL = (filename: string) => {
  return (
    filename.startsWith('http://') ||
    filename.startsWith('https://') ||
    filename.startsWith('ftp://') ||
    filename.startsWith('blob:') ||
    filename.startsWith('data:')
  );
};

const isFetchableUrl = (url: string) => {
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('ftp://')
  );
};

type Options = {
  project: gdProject,
  fileMetadata: FileMetadata,
  onProgress: (count: number, total: number) => void,
};

/**
 * When loading resources from a project from a URL,
 * try to replace relative resource files by a full URL.
 * The heuristic is: if the project is accessible on a URL, then the resources
 * must be located next to it.
 * This is helpful to work on a project stored publicly (like on GitHub).
 */
export const fetchRelativeResourcesToFullUrls = async ({
  project,
  fileMetadata,
  onProgress,
}: Options) => {
  const resourcesManager = project.getResourcesManager();
  const allResourceNames = resourcesManager.getAllResourceNames().toJSArray();
  const erroredResources = [];

  const projectFileUrl = fileMetadata.fileIdentifier;
  const projectBaseUrl = projectFileUrl.substr(
    0,
    projectFileUrl.lastIndexOf('/') + 1
  );
  if (!isFetchableUrl(projectBaseUrl)) {
    // Can't fetch anything relative to this project, because
    // this project does not have a public URL.
    return {
      erroredResources: [],
    };
  }

  let fetchedResourcesCount = 0;
  const resourcesToFetch = allResourceNames.filter(resourceName => {
    const resource = resourcesManager.getResource(resourceName);

    return !isURL(resource.getFile());
  });

  await PromisePool.withConcurrency(20)
    .for(resourcesToFetch)
    .process(async resourceName => {
      const resource = resourcesManager.getResource(resourceName);

      try {
        const resourceFullUrl = new URL(resource.getFile(), projectBaseUrl)
          .href;
        await axios.get(resourceFullUrl, {
          timeout: 3000,
        });

        resource.setFile(resourceFullUrl);
      } catch (error) {
        erroredResources.push({ resourceName, error });
      }

      onProgress(fetchedResourcesCount++, resourcesToFetch.length);
    });

  return {
    erroredResources,
  };
};

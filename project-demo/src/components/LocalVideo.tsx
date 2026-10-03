import {Video} from '@remotion/media';
import {staticFile} from 'remotion';

// relativePath is relative to project-demo/public (e.g. recordings/01-feature.mp4).
export const LocalVideo = ({relativePath}: {relativePath: string}) => <Video src={staticFile(relativePath)} muted objectFit="contain" style={{width: '100%', height: '100%'}} />;

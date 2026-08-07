import * as connectionCapability from './project_graph_connection_bitable_crud_1.json';
import * as nodeCapability from './project_graph_node_crud_1.json';

describe('Project graph Base capability bindings', () => {
  it('uses concrete Base routing values for the node table', () => {
    expect(nodeCapability.paramsSchema).toEqual({});
    expect(nodeCapability.formValue).toMatchObject({
      appToken: 'WC3cb3acOaminMsXKbTcwPKdnMg',
      tableID: 'tblVIjVsxIbuk1QQ',
    });
  });

  it('uses concrete Base routing values for the connection table', () => {
    expect(connectionCapability.paramsSchema).toEqual({});
    expect(connectionCapability.formValue).toMatchObject({
      appToken: 'WC3cb3acOaminMsXKbTcwPKdnMg',
      tableID: 'tblFSCyy1hjLEFO5',
    });
  });
});

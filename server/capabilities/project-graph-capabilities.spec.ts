import * as connectionCapability from './project_graph_connection_bitable_crud_1.json';
import * as nodeCapability from './project_graph_node_crud_1.json';
import * as projectCapability from './project_graph_project_crud_1.json';

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

  it('uses the shared Web project catalog for local and cloud runtimes', () => {
    expect(projectCapability.paramsSchema).toEqual({});
    expect(projectCapability.formValue).toMatchObject({
      appToken: 'I2hLbxQOsaZYcQsPuSOc3UMWnSe',
      tableID: 'tblrpWm6qG55Xssv',
    });
    expect(
      projectCapability.formValue.fields.map((field) => [
        field.id,
        field.name,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['fld3xCuGjA', '项目编码'],
        ['fldGIR9HOF', '项目名称'],
        ['fldIpUCRay', 'Base Token'],
        ['fldxe2o4ge', '节点表 ID'],
        ['fldCPpP7pD', '连线表 ID'],
      ]),
    );
  });
});
